"""Analytical endpoints built on top of the published index.

Everything here is derived. The index itself is computed in the engine and stored; these
endpoints read that series and say something further about it: whether the movement
survives a change of formula, whether the data behind it can be trusted, where it may be
going, what a policy shock would do to it, and which movements are unusual.

The separation is deliberate. A reader who only trusts the measurement can use `/v1/index`
and ignore this module entirely. Nothing here feeds back into the published number.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.endpoints import ALL_WINDOWS, latest_index_date, methodology_version
from app.core.config import CONFIG_DIR, get_methodology_config, get_weights_config
from app.core.ratelimit import enforce_rate_limit
from app.db.models import BasePeriod, CellDaily, Fare, IndexValue, RawObservation, Route, Source
from app.db.session import get_session
from engine import analyst as analyst_mod
from engine import forecast as forecast_mod
from engine import formulas as formulas_mod
from engine import pipeline as pipeline_mod
from engine import scenario as scenario_mod
from engine import trust as trust_mod

router = APIRouter(prefix="/v1", dependencies=[Depends(enforce_rate_limit)])


def _load_policy() -> dict:
    import yaml

    path = CONFIG_DIR / "policy.yaml"
    if not path.exists():
        raise HTTPException(500, "config/policy.yaml is missing")
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def _national_series(session: Session, days: int | None = None) -> tuple[list[dt.date], list[float]]:
    statement = (
        select(IndexValue)
        .where(IndexValue.scope == "national", IndexValue.window == ALL_WINDOWS)
        .order_by(IndexValue.date)
    )
    rows = list(session.scalars(statement).all())
    if days:
        rows = rows[-days:]
    return [r.date for r in rows], [r.apix for r in rows]


def _data_is_synthetic(session: Session) -> bool:
    kinds = session.execute(
        select(Source.kind, func.count(Fare.id))
        .join(Fare, Fare.source_id == Source.id)
        .group_by(Source.kind)
    ).all()
    if not kinds:
        return False
    total = sum(count for _, count in kinds)
    synthetic = sum(count for kind, count in kinds if kind == "synthetic")
    return synthetic > 0 and synthetic / total > 0.5


# ---------------------------------------------------------------------------
# Formula comparison
# ---------------------------------------------------------------------------

class FormulaResponse(BaseModel):
    date: dt.date
    comparison_date: dt.date
    methodology_version: str
    quantity_mode: str
    elasticity: float | None
    headline: str
    spread: float
    results: list[dict[str, Any]]
    notes: list[str]


@router.get("/analytics/formulas", response_model=FormulaResponse, tags=["analytics"])
def compare_formulas(
    session: Session = Depends(get_session),
    date: dt.date | None = Query(None),
    lag_days: int = Query(30, ge=1, le=365),
    quantity_mode: str = Query("elasticity_model"),
) -> FormulaResponse:
    """The same price movement measured eight different ways.

    The point is the spread. Where the formulas agree, the movement is a property of the
    market. Where they disagree, the choice of method is doing part of the work, and the
    reader is entitled to know which case they are in.
    """
    try:
        mode = formulas_mod.QuantityMode(quantity_mode)
    except ValueError:
        raise HTTPException(
            400,
            f"quantity_mode must be one of: "
            f"{', '.join(m.value for m in formulas_mod.QuantityMode)}",
        ) from None

    as_of = date or latest_index_date(session)
    if as_of is None:
        raise HTTPException(404, "No index values have been published yet")
    comparison = as_of - dt.timedelta(days=lag_days)

    prices, route_codes = pipeline_mod._load_cell_prices(session)  # noqa: SLF001
    if prices.empty:
        raise HTTPException(404, "No cell prices available")

    now = prices[prices["date"] == as_of].set_index("cell")
    then = prices[prices["date"] == comparison].set_index("cell")
    shared = [c for c in now.index if c in then.index]
    if not shared:
        raise HTTPException(
            404,
            f"No cells have a price on both {comparison.isoformat()} and {as_of.isoformat()}",
        )

    route_weights = pipeline_mod._route_weights(session)  # noqa: SLF001
    lead_weights = pipeline_mod._lead_time_weights()  # noqa: SLF001

    p0, pt, weights, obs0, obst = [], [], [], [], []
    for cell in shared:
        price_then = then.loc[cell, "price"]
        price_now = now.loc[cell, "price"]
        if price_then is None or price_now is None:
            continue
        route_code, _, lead = str(cell).partition("|")
        weight = route_weights.get(route_code, 0.0) * lead_weights.get(int(lead), 0.0)
        if weight <= 0:
            continue
        p0.append(float(price_then))
        pt.append(float(price_now))
        weights.append(weight)
        obs0.append(float(then.loc[cell, "obs_count"] or 0))
        obst.append(float(now.loc[cell, "obs_count"] or 0))

    if not p0:
        raise HTTPException(404, "No weighted cells available for comparison")

    elasticity = float(
        (_load_policy().get("demand") or {}).get("own_price_elasticity", 1.2)
    )
    result = formulas_mod.compare_formulas(
        np.array(p0), np.array(pt), np.array(weights),
        obs0=np.array(obs0), obst=np.array(obst),
        mode=mode, elasticity=elasticity,
    )
    payload = result.as_dict()
    return FormulaResponse(
        date=as_of,
        comparison_date=comparison,
        methodology_version=methodology_version(),
        quantity_mode=str(payload["quantity_mode"]),
        elasticity=payload["elasticity"],  # type: ignore[arg-type]
        headline=str(payload["headline"]),
        spread=float(payload["spread"]),  # type: ignore[arg-type]
        results=list(payload["results"]),  # type: ignore[arg-type]
        notes=list(payload["notes"]),  # type: ignore[arg-type]
    )


# ---------------------------------------------------------------------------
# Trust
# ---------------------------------------------------------------------------

class TrustResponse(BaseModel):
    overall: float | None
    band: str
    as_of: dt.date | None
    components: list[dict[str, Any]]
    warnings: list[str]


def _build_trust(session: Session) -> trust_mod.TrustReport:
    as_of = latest_index_date(session)
    latest_capture = session.scalar(select(func.max(RawObservation.captured_at)))

    latest_index = session.scalars(
        select(IndexValue)
        .where(IndexValue.scope == "national", IndexValue.window == ALL_WINDOWS)
        .order_by(IndexValue.date.desc())
        .limit(1)
    ).first()

    obs_per_cell = None
    if as_of is not None:
        cells = session.execute(
            select(func.count(CellDaily.id), func.coalesce(func.sum(CellDaily.obs_count), 0))
            .where(CellDaily.date == as_of)
        ).first()
        if cells and cells[0]:
            obs_per_cell = float(cells[1]) / float(cells[0])

    source_kinds = dict(
        session.execute(
            select(Source.kind, func.count(Fare.id))
            .join(Fare, Fare.source_id == Source.id)
            .group_by(Source.kind)
        ).all()
    )

    # Cross-source agreement: only measurable where two sources priced the same cell.
    spreads: list[float] = []
    if as_of is not None and len(source_kinds) > 1:
        rows = session.execute(
            select(
                Fare.route_id, Fare.lead_time_days, Fare.source_id,
                func.min(Fare.total_fare),
            )
            .where(Fare.observation_date == as_of, Fare.is_valid.is_(True))
            .group_by(Fare.route_id, Fare.lead_time_days, Fare.source_id)
        ).all()
        by_cell: dict[tuple[int, int], list[float]] = {}
        for route_id, lead, _source_id, minimum in rows:
            by_cell.setdefault((route_id, lead), []).append(float(minimum))
        for values in by_cell.values():
            if len(values) > 1:
                low, high = min(values), max(values)
                if low > 0:
                    spreads.append((high - low) / low)

    return trust_mod.build_report(
        latest_observation=latest_capture,
        now=dt.datetime.now(),
        coverage=latest_index.coverage if latest_index else None,
        coverage_threshold=float(get_methodology_config().get("coverage_threshold", 0.6)),
        obs_per_cell=obs_per_cell,
        source_kinds={str(k): int(v) for k, v in source_kinds.items()},
        cell_spreads=spreads,
        as_of=as_of,
    )


@router.get("/analytics/trust", response_model=TrustResponse, tags=["analytics"])
def trust(session: Session = Depends(get_session)) -> TrustResponse:
    """Whether the current series should be believed, and why.

    Components that cannot be measured are reported as unmeasured rather than given a
    default score, because a trust score that assumes the best about what it cannot see is
    worse than no score.
    """
    payload = _build_trust(session).as_dict()
    return TrustResponse(**payload)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Forecast
# ---------------------------------------------------------------------------

class ForecastResponse(BaseModel):
    as_of: dt.date | None
    methodology_version: str
    horizon_days: int
    confidence: float
    holdout_days: int
    history: list[dict[str, Any]]
    points: list[dict[str, Any]]
    scores: list[dict[str, Any]]
    per_model: dict[str, list[float]]
    notes: list[str]


@router.get("/analytics/forecast", response_model=ForecastResponse, tags=["analytics"])
def forecast(
    session: Session = Depends(get_session),
    horizon: int = Query(14, ge=1, le=60),
    confidence: float = Query(0.95, ge=0.5, le=0.99),
    history_days: int = Query(90, ge=20, le=730),
) -> ForecastResponse:
    """A fourteen-day projection with out-of-sample model scores.

    Every model is scored on a holdout it did not see, and those scores are returned with
    the forecast. A projection without an out-of-sample error is a line on a chart.
    """
    dates, values = _national_series(session, days=history_days)
    if len(values) < 16:
        raise HTTPException(
            404,
            f"Only {len(values)} published index values. A seasonal model needs at least "
            "16 before it can be fitted.",
        )

    result = forecast_mod.forecast(
        dates, values, horizon=horizon, confidence=confidence
    )
    payload = result.as_dict()
    return ForecastResponse(
        as_of=dates[-1] if dates else None,
        methodology_version=methodology_version(),
        horizon_days=int(payload["horizon_days"]),  # type: ignore[arg-type]
        confidence=float(payload["confidence"]),  # type: ignore[arg-type]
        holdout_days=int(payload["holdout_days"]),  # type: ignore[arg-type]
        history=[
            {"date": d.isoformat(), "value": round(v, 4)}
            for d, v in zip(dates, values, strict=True)
        ],
        points=list(payload["points"]),  # type: ignore[arg-type]
        scores=list(payload["scores"]),  # type: ignore[arg-type]
        per_model=dict(payload["per_model"]),  # type: ignore[arg-type]
        notes=list(payload["notes"]),  # type: ignore[arg-type]
    )


# ---------------------------------------------------------------------------
# Anomalies
# ---------------------------------------------------------------------------

class AnomalyResponse(BaseModel):
    as_of: dt.date | None
    threshold: float
    count: int
    items: list[dict[str, Any]]
    note: str


@router.get("/analytics/anomalies", response_model=AnomalyResponse, tags=["analytics"])
def anomalies(
    session: Session = Depends(get_session),
    threshold: float = Query(3.0, ge=1.5, le=10.0),
    days: int = Query(90, ge=10, le=730),
) -> AnomalyResponse:
    """Unusual day-on-day movements in the published series."""
    dates, values = _national_series(session, days=days)
    found = scenario_mod.detect_series_anomalies(dates, values, z_threshold=threshold)
    return AnomalyResponse(
        as_of=dates[-1] if dates else None,
        threshold=threshold,
        count=len(found),
        items=found,
        note=(
            "Scored on the median absolute deviation of daily log changes, so one large "
            "jump cannot inflate the threshold that would have caught it. A flag means "
            "the movement is unusual for this series, not that it is wrong."
        ),
    )


# ---------------------------------------------------------------------------
# Scenario simulation
# ---------------------------------------------------------------------------

class ScenarioRequest(BaseModel):
    airfare_shock_pct: float = Field(0.0, description="Direct shock to fares, per cent")
    atf_shock_pct: float = Field(0.0, description="Aviation turbine fuel price change, per cent")
    demand_shock_pct: float = Field(0.0, description="Change in demand, per cent")
    capacity_shock_pct: float = Field(0.0, description="Change in seats offered, per cent")
    horizon_days: int = Field(90, ge=1, le=180)
    include_sensitivity: bool = True


class ScenarioResponse(BaseModel):
    baseline_index: float
    baseline_date: dt.date
    inputs: dict[str, float]
    assumptions: dict[str, Any]
    channels: list[dict[str, Any]]
    total_fare_effect_pct: float
    cpi_effect_pp: float | None
    cpi_effect_is_official: bool
    path: list[dict[str, Any]]
    sensitivity: list[dict[str, Any]]
    notes: list[str]
    warnings: list[str]


@router.post("/analytics/scenario", response_model=ScenarioResponse, tags=["analytics"])
def simulate_scenario(
    body: ScenarioRequest, session: Session = Depends(get_session)
) -> ScenarioResponse:
    """Run a policy what-if against the current index level.

    Read the assumptions block in the response. Every coefficient is a stated prior from
    configuration, none is estimated from AirIndex data, and the sensitivity table shows
    how much of the answer each prior is responsible for.
    """
    latest = session.scalars(
        select(IndexValue)
        .where(IndexValue.scope == "national", IndexValue.window == ALL_WINDOWS)
        .order_by(IndexValue.date.desc())
        .limit(1)
    ).first()
    if latest is None:
        raise HTTPException(404, "No index values have been published yet")

    policy = _load_policy()
    inputs = scenario_mod.ScenarioInput(
        airfare_shock_pct=body.airfare_shock_pct,
        atf_shock_pct=body.atf_shock_pct,
        demand_shock_pct=body.demand_shock_pct,
        capacity_shock_pct=body.capacity_shock_pct,
        horizon_days=body.horizon_days,
    )

    try:
        result = scenario_mod.simulate(
            inputs, policy, baseline_index=latest.apix, baseline_date=latest.date
        )
    except scenario_mod.ScenarioError as exc:
        raise HTTPException(400, str(exc)) from None

    sensitivity_rows: list[dict[str, Any]] = []
    if body.include_sensitivity:
        sensitivity_rows = scenario_mod.sensitivity(
            inputs, policy, baseline_index=latest.apix, baseline_date=latest.date
        )

    payload = result.as_dict()
    return ScenarioResponse(
        baseline_index=latest.apix,
        baseline_date=latest.date,
        inputs=dict(payload["inputs"]),  # type: ignore[arg-type]
        assumptions=dict(payload["assumptions"]),  # type: ignore[arg-type]
        channels=list(payload["channels"]),  # type: ignore[arg-type]
        total_fare_effect_pct=float(payload["total_fare_effect_pct"]),  # type: ignore[arg-type]
        cpi_effect_pp=payload["cpi_effect_pp"],  # type: ignore[arg-type]
        cpi_effect_is_official=bool(payload["cpi_effect_is_official"]),
        path=list(payload["path"]),  # type: ignore[arg-type]
        sensitivity=sensitivity_rows,
        notes=list(payload["notes"]),  # type: ignore[arg-type]
        warnings=list(payload["warnings"]),  # type: ignore[arg-type]
    )


@router.get("/analytics/scenario/assumptions", tags=["analytics"])
def scenario_assumptions() -> dict[str, Any]:
    """The full contents of the policy configuration, so a reader can audit the model."""
    policy = _load_policy()
    policy["_note"] = (
        "Every value here is a stated prior drawn from the literature, not estimated "
        "from AirIndex data. The simulator is only as good as this file, which is why "
        "it is served in full."
    )
    return policy


# ---------------------------------------------------------------------------
# Analyst
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    question: str = Field(..., max_length=500)
    use_model: bool = True


class AskResponse(BaseModel):
    question: str
    answer: str
    mode: str
    grounded: bool
    evidence: dict[str, Any]
    notes: list[str]
    suggested_questions: list[str]


def _build_evidence(session: Session) -> analyst_mod.Evidence:
    """Assemble everything an answer is allowed to draw on.

    This function is the security boundary of the analyst. Whatever is not put in here
    cannot appear in an answer, because the model is instructed to use only this block and
    the deterministic path reads nothing else.
    """
    evidence = analyst_mod.Evidence()
    as_of = latest_index_date(session)

    latest = session.scalars(
        select(IndexValue)
        .where(IndexValue.scope == "national", IndexValue.window == ALL_WINDOWS)
        .order_by(IndexValue.date.desc())
        .limit(1)
    ).first()
    if latest:
        evidence.add("latest_index", {
            "date": latest.date.isoformat(),
            "apix": latest.apix,
            "wow_pct": latest.wow_pct,
            "mom_pct": latest.mom_pct,
            "coverage": latest.coverage,
            "obs_count": latest.obs_count,
            "imputed_cells": latest.imputed_cells,
        })

    config = get_methodology_config()
    weights = get_weights_config()
    base = session.scalars(select(BasePeriod).limit(1)).first()
    evidence.add("methodology", {
        "methodology_version": config.get("methodology_version"),
        "index_type": config.get("index_type"),
        "formula": config.get("formula"),
        "price_basis": config.get("price_basis"),
        "base_period": (
            f"{base.start_date.isoformat()} to {base.end_date.isoformat()} = 100"
            if base else "not yet established"
        ),
        "weights_source": weights.get("source"),
        "weights_are_official": weights.get("official", False),
        "coverage_threshold": config.get("coverage_threshold"),
    })

    if as_of:
        movers = session.scalars(
            select(IndexValue).where(
                IndexValue.scope == "route",
                IndexValue.window == ALL_WINDOWS,
                IndexValue.date == as_of,
                IndexValue.wow_pct.is_not(None),
            )
        ).all()
        ranked = sorted(movers, key=lambda v: abs(v.wow_pct or 0.0), reverse=True)[:5]
        evidence.add("top_movers", [
            {"code": v.scope_id, "apix": v.apix, "wow_pct": v.wow_pct} for v in ranked
        ])

    evidence.add("data_is_synthetic", _data_is_synthetic(session))
    evidence.add("trust", _build_trust(session).as_dict())

    routes = session.scalars(select(Route).where(Route.active.is_(True))).all()
    evidence.add("basket", {
        "routes": len(routes),
        "lead_times": config.get("lead_times"),
        "route_codes": [r.code for r in routes],
    })

    dates, values = _national_series(session, days=120)
    if len(values) >= 16:
        try:
            projection = forecast_mod.forecast(dates, values, horizon=14)
            if projection.points:
                evidence.add("forecast", {
                    "points": [
                        {
                            "date": p.date.isoformat(),
                            "value": round(p.value, 2),
                            "lower": round(p.lower, 2),
                            "upper": round(p.upper, 2),
                        }
                        for p in projection.points[::7]
                    ],
                    "best_model": projection.scores[0].name if projection.scores else None,
                })
        except Exception:  # noqa: BLE001 - a missing forecast is not an error here
            pass

    if as_of:
        try:
            from engine.index import contribution_analysis

            prices, route_codes = pipeline_mod._load_cell_prices(session)  # noqa: SLF001
            route_weights = pipeline_mod._route_weights(session)  # noqa: SLF001
            lead_weights = pipeline_mod._lead_time_weights()  # noqa: SLF001
            cell_weights = {
                f"{code}|{lead}": route_weights.get(code, 0.0) * lead_weights.get(lead, 0.0)
                for code in route_weights
                for lead in lead_weights
            }
            base_rows = session.scalars(select(BasePeriod)).all()
            base_prices = {
                f"{route_codes.get(b.route_id)}|{b.lead_time_days}": b.base_fare
                for b in base_rows
                if route_codes.get(b.route_id)
            }
            frame = contribution_analysis(
                prices[["date", "cell", "price", "obs_count"]],
                cell_weights, base_prices, as_of, as_of - dt.timedelta(days=7),
            )
            if not frame.empty:
                evidence.add("contributions", frame.head(6).to_dict(orient="records"))
        except Exception:  # noqa: BLE001
            pass

    return evidence


@router.post("/analytics/ask", response_model=AskResponse, tags=["analytics"])
def ask(body: AskRequest, session: Session = Depends(get_session)) -> AskResponse:
    """Ask a question about the index and get an answer grounded in the data.

    Every number in the answer comes from the evidence block, which is returned with the
    reply so it can be checked. Without an Anthropic API key configured the answer is
    composed directly from that evidence with no language model involved.
    """
    evidence = _build_evidence(session)
    result = analyst_mod.answer(body.question, evidence, prefer_model=body.use_model)
    payload = result.as_dict()
    return AskResponse(
        question=body.question,
        answer=str(payload["answer"]),
        mode=str(payload["mode"]),
        grounded=bool(payload["grounded"]),
        evidence=dict(payload["evidence"]),  # type: ignore[arg-type]
        notes=list(payload["notes"]),  # type: ignore[arg-type]
        suggested_questions=analyst_mod.SUGGESTED_QUESTIONS,
    )


@router.get("/analytics/ask/suggestions", tags=["analytics"])
def ask_suggestions() -> dict[str, Any]:
    return {
        "suggestions": analyst_mod.SUGGESTED_QUESTIONS,
        "note": (
            "The analyst answers only from the stored index, its methodology and its "
            "quality metrics. It does not give booking or investment advice."
        ),
    }
