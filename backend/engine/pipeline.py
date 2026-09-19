"""Orchestration: database in, database out.

Everything statistical lives in the pure modules next to this one. This file is the only
place that knows both about them and about the database, which keeps the index formula
testable without a database and the database code free of statistics.

Three stages, each runnable on its own:

    process_observations  raw_observations -> fares      (normalise, validate, outliers)
    rebuild_cells         fares            -> cell_daily (minimum logical fare per cell)
    recompute_index       cell_daily       -> index_values
"""

from __future__ import annotations

import datetime as dt
import logging
from dataclasses import dataclass, field

import pandas as pd
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import (
    get_methodology_config,
    get_routes_config,
    get_weights_config,
)
from app.db.models import (
    AuditLog,
    BasePeriod,
    CellDaily,
    Fare,
    IndexValue,
    RawObservation,
    Route,
    Source,
)
from engine import cells as cells_mod
from engine import index as index_mod
from engine import normalise as normalise_mod
from engine import quality as quality_mod

logger = logging.getLogger("airindex.engine")

SCOPE_NATIONAL = "national"
SCOPE_ROUTE = "route"
SCOPE_AIRLINE = "airline"
ALL_WINDOWS = 0


@dataclass
class PipelineReport:
    observations_read: int = 0
    fares_written: int = 0
    fares_rejected: int = 0
    outliers: int = 0
    cells_written: int = 0
    index_values_written: int = 0
    base_window: tuple[dt.date, dt.date] | None = None
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        return {
            "observations_read": self.observations_read,
            "fares_written": self.fares_written,
            "fares_rejected": self.fares_rejected,
            "outliers": self.outliers,
            "cells_written": self.cells_written,
            "index_values_written": self.index_values_written,
            "base_window": (
                [self.base_window[0].isoformat(), self.base_window[1].isoformat()]
                if self.base_window
                else None
            ),
            "notes": self.notes,
        }


# ---------------------------------------------------------------------------
# Stage one: raw observations become validated fares.
# ---------------------------------------------------------------------------

def process_observations(session: Session, report: PipelineReport | None = None) -> PipelineReport:
    """Normalise and validate every raw observation that has no fare row yet.

    Reprocessing is idempotent by construction: the set of unprocessed observations is
    derived from what is missing in `fares`, so running this twice does nothing the
    second time.
    """
    report = report or PipelineReport()
    methodology = get_methodology_config()
    lead_times = [int(v) for v in methodology.get("lead_times", [1, 7, 15, 30, 45])]

    processed_ids = select(Fare.raw_id).where(Fare.raw_id.is_not(None))
    pending = session.scalars(
        select(RawObservation).where(RawObservation.id.not_in(processed_ids))
    ).all()
    report.observations_read = len(pending)
    if not pending:
        report.notes.append("no new raw observations")
        return report

    route_codes = {
        route.id: route.code for route in session.scalars(select(Route)).all()
    }
    source_codes = {
        source.id: source.code for source in session.scalars(select(Source)).all()
    }

    rows: list[dict[str, object]] = []
    unparseable = 0
    for observation in pending:
        # The payload is whatever the source sent. The columns beside it are what the
        # collector recorded independently, and they win: a source that omits the
        # departure date or spells the carrier differently in its body must not produce
        # a fare that disagrees with the request that fetched it.
        payload = dict(observation.payload or {})
        payload.setdefault("departure_date", observation.departure_date)
        payload["airline"] = observation.airline_code
        payload.setdefault("cabin", observation.cabin)
        payload.setdefault("currency", observation.currency)
        if observation.flight_no:
            payload.setdefault("flight_no", observation.flight_no)

        normalised = normalise_mod.normalise_observation(
            payload=payload,
            route_code=route_codes.get(observation.route_id, "UNKNOWN"),
            source_code=source_codes.get(observation.source_id, "unknown"),
            captured_at=observation.captured_at,
        )
        if normalised is None:
            unparseable += 1
            continue
        rows.append({
            "raw_id": observation.id,
            "source_id": observation.source_id,
            "route_id": observation.route_id,
            "departure_date": normalised.departure_date,
            "captured_at": normalised.captured_at,
            "observation_date": normalised.observation_date,
            "lead_time_days": normalised.lead_time_days,
            "airline_code": normalised.airline_code,
            "cabin": normalised.cabin,
            "currency": normalised.currency,
            "base_fare": normalised.base_fare,
            "taxes": normalised.taxes,
            "udf": normalised.udf,
            "convenience_fee": normalised.convenience_fee,
            "total_fare": normalised.total_fare,
            "components_were_split": normalised.components_were_split,
        })

    if unparseable:
        report.notes.append(f"{unparseable} observations could not be parsed into a fare")

    if not rows:
        return report

    frame = pd.DataFrame(rows)
    frame = quality_mod.validate_fares(
        frame,
        min_fare=float(methodology.get("min_plausible_fare_inr", 500)),
        max_fare=float(methodology.get("max_plausible_fare_inr", 100000)),
        max_lead_time_days=int(methodology.get("max_lead_time_days", 60)),
        lead_times=lead_times,
    )
    frame = quality_mod.flag_outliers(
        frame, threshold=float(methodology.get("mad_threshold", 3.5))
    )

    for record in frame.to_dict(orient="records"):
        session.add(
            Fare(
                raw_id=record["raw_id"],
                source_id=record["source_id"],
                route_id=record["route_id"],
                departure_date=record["departure_date"],
                captured_at=record["captured_at"],
                observation_date=record["observation_date"],
                lead_time_days=int(record["lead_time_days"]),
                airline_code=record["airline_code"],
                cabin=record["cabin"],
                currency=record["currency"],
                base_fare=float(record["base_fare"]),
                taxes=float(record["taxes"]),
                udf=float(record["udf"]),
                convenience_fee=float(record["convenience_fee"]),
                total_fare=float(record["total_fare"]),
                is_valid=bool(record["is_valid"]),
                quality_flags=list(record["quality_flags"]),
            )
        )

    report.fares_written = int(len(frame))
    report.fares_rejected = int((~frame["is_valid"].astype(bool)).sum())
    report.outliers = int(
        sum(1 for flags in frame["quality_flags"] if quality_mod.FLAG_OUTLIER_MAD in flags)
    )

    try:
        session.flush()
    except IntegrityError as exc:
        # The unique constraint on Fare.raw_id caught a duplicate the pre-filter above
        # missed. Fail loudly with an instruction rather than half-writing the batch:
        # silently doubled observation counts are much harder to notice than a crash.
        session.rollback()
        raise RuntimeError(
            "Refused to write duplicate fares: at least one raw observation already has "
            "a fare row. This means the pipeline ran twice over the same observations. "
            "Rebuild the fare layer with `python cli.py recompute --rebuild-fares`."
        ) from exc

    return report


def rebuild_fares(session: Session, report: PipelineReport | None = None) -> PipelineReport:
    """Delete every fare and derive them again from the raw observations.

    The fare layer is entirely derived, so discarding it loses nothing that cannot be
    recomputed, and it is the only clean way out of a duplicated or half-written state.
    Raw observations, which are the actual measurements, are never touched.
    """
    report = report or PipelineReport()
    removed = session.query(Fare).delete(synchronize_session=False)
    session.flush()
    report.notes.append(f"rebuild: removed {removed} existing fare rows")
    session.add(
        AuditLog(
            action="rebuild_fares",
            entity="fares",
            detail={"rows_removed": int(removed)},
        )
    )
    return process_observations(session, report)


# ---------------------------------------------------------------------------
# Stage two: fares become priced cells.
# ---------------------------------------------------------------------------

def _load_fares_frame(session: Session, since: dt.date | None = None) -> pd.DataFrame:
    statement = select(
        Fare.observation_date,
        Fare.route_id,
        Fare.lead_time_days,
        Fare.airline_code,
        Fare.total_fare,
        Fare.is_valid,
        Fare.quality_flags,
    )
    if since is not None:
        statement = statement.where(Fare.observation_date >= since)
    records = session.execute(statement).all()
    if not records:
        return pd.DataFrame(
            columns=[
                "observation_date", "route_id", "lead_time_days", "airline_code",
                "total_fare", "is_valid", "quality_flags",
            ]
        )
    return pd.DataFrame(records, columns=[
        "observation_date", "route_id", "lead_time_days", "airline_code",
        "total_fare", "is_valid", "quality_flags",
    ])


def rebuild_cells(
    session: Session, since: dt.date | None = None, report: PipelineReport | None = None
) -> PipelineReport:
    """Recompute cell_daily from fares.

    Rebuilt rather than updated in place. The cell layer is a derived view of the fare
    layer, and a derived view that is patched incrementally eventually disagrees with
    what it was derived from.
    """
    report = report or PipelineReport()
    fares = _load_fares_frame(session, since)
    if fares.empty:
        report.notes.append("no fares to aggregate")
        return report

    methodology = get_methodology_config()
    frame = cells_mod.build_cells(fares)
    frame = cells_mod.apply_min_observations(
        frame, int(methodology.get("min_obs_per_cell", 3))
    )

    if since is None:
        session.execute(delete(CellDaily))
    else:
        session.execute(delete(CellDaily).where(CellDaily.date >= since))
    session.flush()

    def _nullable(value: object) -> float | None:
        """Pandas turns a missing price into NaN. NaN is not valid JSON and it is not
        NULL, so it must not reach the database or an API response."""
        if value is None or pd.isna(value):  # type: ignore[arg-type]
            return None
        return float(value)  # type: ignore[arg-type]

    for record in frame.to_dict(orient="records"):
        session.add(
            CellDaily(
                date=record["date"],
                route_id=int(record["route_id"]),
                lead_time_days=int(record["lead_time_days"]),
                min_logical_fare=_nullable(record["min_logical_fare"]),
                mean_fare=_nullable(record["mean_fare"]),
                obs_count=int(record["obs_count"]),
                outliers_excluded=int(record["outliers_excluded"]),
                imputed=False,
                airlines_seen=list(record["airlines_seen"]),
            )
        )
    report.cells_written = int(len(frame))
    session.flush()
    return report


# ---------------------------------------------------------------------------
# Stage three: cells become the index.
# ---------------------------------------------------------------------------

def _lead_time_weights() -> dict[int, float]:
    raw = get_weights_config().get("lead_time_weights", {}) or {}
    weights = {int(k): float(v) for k, v in raw.items()}
    total = sum(weights.values())
    if total <= 0:
        return {}
    return {k: v / total for k, v in weights.items()}


def _route_weights(session: Session) -> dict[str, float]:
    routes = session.scalars(select(Route).where(Route.active.is_(True))).all()
    weights = {route.code: float(route.weight or 0.0) for route in routes}
    total = sum(weights.values())
    if total <= 0:
        # No sourced weights. Fall back to equal weighting and say so loudly, rather
        # than inventing shares that look authoritative.
        logger.warning("No route weights configured; falling back to equal weights")
        count = len(weights) or 1
        return {code: 1.0 / count for code in weights}
    return {code: value / total for code, value in weights.items()}


def _load_cell_prices(session: Session) -> tuple[pd.DataFrame, dict[int, str]]:
    """Cell prices as the long frame the index module expects."""
    route_codes = {
        route.id: route.code for route in session.scalars(select(Route)).all()
    }
    records = session.execute(
        select(
            CellDaily.date,
            CellDaily.route_id,
            CellDaily.lead_time_days,
            CellDaily.min_logical_fare,
            CellDaily.obs_count,
        )
    ).all()
    if not records:
        return pd.DataFrame(columns=["date", "cell", "price", "obs_count", "route_code",
                                     "lead_time_days"]), route_codes

    frame = pd.DataFrame(
        records, columns=["date", "route_id", "lead_time_days", "price", "obs_count"]
    )
    frame["route_code"] = frame["route_id"].map(route_codes)
    frame = frame[frame["route_code"].notna()]
    frame["cell"] = frame["route_code"] + "|" + frame["lead_time_days"].astype(str)
    return frame[["date", "cell", "price", "obs_count", "route_code", "lead_time_days"]], route_codes


def _load_airline_prices(session: Session) -> pd.DataFrame:
    fares = _load_fares_frame(session)
    if fares.empty:
        return pd.DataFrame(columns=["date", "cell", "price", "obs_count", "airline_code",
                                     "route_code", "lead_time_days"])
    route_codes = {route.id: route.code for route in session.scalars(select(Route)).all()}
    frame = cells_mod.build_airline_cells(fares)
    if frame.empty:
        return pd.DataFrame(columns=["date", "cell", "price", "obs_count", "airline_code",
                                     "route_code", "lead_time_days"])
    frame["route_code"] = frame["route_id"].map(route_codes)
    frame = frame[frame["route_code"].notna()]
    frame["cell"] = frame["route_code"] + "|" + frame["lead_time_days"].astype(str)
    frame = frame.rename(columns={"min_logical_fare": "price"})
    return frame[["date", "cell", "price", "obs_count", "airline_code", "route_code",
                  "lead_time_days"]]


def _persist_series(
    session: Session,
    series: pd.DataFrame,
    scope: str,
    scope_id: str | None,
    window: int,
    methodology_version: str,
    published_only: bool = True,
) -> int:
    """Upsert one series into index_values.

    A value that already exists for the same date, scope and window is updated in place
    and keeps its identity. A genuine methodology change is expressed by bumping the
    methodology version, which is stored on every row, so history is never silently
    rewritten under a new method.
    """
    if series.empty:
        return 0

    existing = {
        (row.date, row.window): row
        for row in session.scalars(
            select(IndexValue).where(
                IndexValue.scope == scope,
                IndexValue.scope_id == scope_id,
                IndexValue.window == window,
            )
        ).all()
    }

    written = 0
    for record in series.to_dict(orient="records"):
        if published_only and not record.get("published", True):
            continue
        key = (record["date"], window)
        target = existing.get(key)
        if target is None:
            target = IndexValue(
                date=record["date"], scope=scope, scope_id=scope_id, window=window
            )
            session.add(target)
        target.apix = round(float(record["apix"]), 4)
        target.wow_pct = (
            None if pd.isna(record.get("wow_pct")) else round(float(record["wow_pct"]), 4)
        )
        target.mom_pct = (
            None if pd.isna(record.get("mom_pct")) else round(float(record["mom_pct"]), 4)
        )
        target.coverage = round(float(record["coverage"]), 4)
        target.obs_count = int(record["obs_count"])
        target.imputed_cells = int(record["imputed_cells"])
        target.provisional = False
        target.methodology_version = methodology_version
        written += 1

    session.flush()
    return written


def _persist_base_period(
    session: Session,
    base_prices: dict[str, float],
    window: index_mod.BaseWindow,
    route_ids: dict[str, int],
    methodology_version: str,
) -> None:
    session.execute(delete(BasePeriod))
    session.flush()
    for cell, price in base_prices.items():
        route_code, _, lead = cell.partition("|")
        route_id = route_ids.get(route_code)
        if route_id is None:
            continue
        session.add(
            BasePeriod(
                route_id=route_id,
                lead_time_days=int(lead),
                base_fare=round(float(price), 4),
                start_date=window.start,
                end_date=window.end,
                days_used=window.days,
                methodology_version=methodology_version,
            )
        )
    session.flush()


def recompute_index(session: Session, report: PipelineReport | None = None) -> PipelineReport:
    """Compute and store every published series.

    Five families of series are produced:
      national, all windows          the headline number
      national, one per lead time    how the booking curve is moving
      route, all windows             one series per city pair
      route, one per lead time       the route detail heatmap
      airline, all windows           a secondary, clearly labelled series
    """
    report = report or PipelineReport()
    methodology = get_methodology_config()
    version = str(methodology.get("methodology_version", "apix-0"))
    min_coverage = float(methodology.get("coverage_threshold", 0.6))
    base_days = int(methodology.get("base_period_days", 3))

    prices, route_codes = _load_cell_prices(session)
    if prices.empty:
        report.notes.append("no cell prices; nothing to index")
        return report

    route_ids = {code: rid for rid, code in route_codes.items()}
    route_weights = _route_weights(session)
    lead_weights = _lead_time_weights()

    national_weights = index_mod.normalise_weights({
        f"{code}|{lead}": route_weights.get(code, 0.0) * lead_weights.get(lead, 0.0)
        for code in route_weights
        for lead in lead_weights
    })

    base_window = index_mod.find_base_window(
        prices[["date", "cell", "price", "obs_count"]],
        national_weights,
        days=base_days,
        min_coverage=min_coverage,
    )
    if base_window is None:
        report.notes.append(
            "no base period yet: fewer than "
            f"{base_days} days clear the {min_coverage:.0%} coverage threshold"
        )
        return report

    report.base_window = (base_window.start, base_window.end)
    base_prices = index_mod.compute_base_prices(
        prices[["date", "cell", "price", "obs_count"]], base_window
    )
    _persist_base_period(session, base_prices, base_window, route_ids, version)

    written = 0

    # National, all windows.
    national_series, _ = index_mod.compute_index(
        prices[["date", "cell", "price", "obs_count"]],
        national_weights,
        base_window=base_window,
        min_coverage=min_coverage,
        base_prices=base_prices,
    )
    written += _persist_series(
        session, national_series, SCOPE_NATIONAL, None, ALL_WINDOWS, version
    )

    # National, one series per lead time. Weighted by route only, because the lead time
    # is fixed within the series.
    for lead in sorted(lead_weights):
        subset = prices[prices["lead_time_days"] == lead]
        if subset.empty:
            continue
        weights = index_mod.normalise_weights({
            f"{code}|{lead}": route_weights.get(code, 0.0) for code in route_weights
        })
        series, _ = index_mod.compute_index(
            subset[["date", "cell", "price", "obs_count"]],
            weights,
            base_window=base_window,
            min_coverage=min_coverage,
            base_prices={c: p for c, p in base_prices.items() if c.endswith(f"|{lead}")},
        )
        written += _persist_series(
            session, series, SCOPE_NATIONAL, None, lead, version
        )

    # Per route, all windows and per lead time.
    for code in route_weights:
        subset = prices[prices["route_code"] == code]
        if subset.empty:
            continue
        weights = index_mod.normalise_weights({
            f"{code}|{lead}": lead_weights.get(lead, 0.0) for lead in lead_weights
        })
        series, _ = index_mod.compute_index(
            subset[["date", "cell", "price", "obs_count"]],
            weights,
            base_window=base_window,
            min_coverage=min_coverage,
            base_prices={c: p for c, p in base_prices.items() if c.startswith(f"{code}|")},
        )
        written += _persist_series(session, series, SCOPE_ROUTE, code, ALL_WINDOWS, version)

        for lead in sorted(lead_weights):
            cell_key = f"{code}|{lead}"
            if cell_key not in base_prices:
                continue
            cell_subset = subset[subset["lead_time_days"] == lead]
            if cell_subset.empty:
                continue
            cell_series, _ = index_mod.compute_index(
                cell_subset[["date", "cell", "price", "obs_count"]],
                {cell_key: 1.0},
                base_window=base_window,
                min_coverage=0.0,  # a single-cell series is either present or absent
                base_prices={cell_key: base_prices[cell_key]},
            )
            written += _persist_series(
                session, cell_series, SCOPE_ROUTE, code, lead, version
            )

    # Per airline, all windows. A secondary series: it answers which carrier moved, and
    # is never the headline number.
    airline_prices = _load_airline_prices(session)
    if not airline_prices.empty:
        for airline, group in airline_prices.groupby("airline_code"):
            weights = index_mod.normalise_weights({
                cell: route_weights.get(cell.split("|")[0], 0.0)
                * lead_weights.get(int(cell.split("|")[1]), 0.0)
                for cell in group["cell"].unique()
            })
            airline_base = index_mod.compute_base_prices(
                group[["date", "cell", "price", "obs_count"]], base_window
            )
            if not airline_base:
                continue
            series, _ = index_mod.compute_index(
                group[["date", "cell", "price", "obs_count"]],
                weights,
                base_window=base_window,
                min_coverage=min_coverage,
                base_prices=airline_base,
            )
            written += _persist_series(
                session, series, SCOPE_AIRLINE, str(airline), ALL_WINDOWS, version
            )

    report.index_values_written = written
    session.add(
        AuditLog(
            action="recompute_index",
            entity="index_values",
            detail={
                "methodology_version": version,
                "base_window": [base_window.start.isoformat(), base_window.end.isoformat()],
                "values_written": written,
                "cells_in_basket": len(national_weights),
            },
        )
    )
    session.flush()
    return report


def run_full_pipeline(
    session: Session, since: dt.date | None = None, rebuild: bool = False
) -> PipelineReport:
    report = PipelineReport()
    if rebuild:
        rebuild_fares(session, report)
    else:
        process_observations(session, report)
    rebuild_cells(session, since, report)
    recompute_index(session, report)
    return report


def latest_observation_date(session: Session) -> dt.date | None:
    return session.scalar(select(func.max(Fare.observation_date)))
