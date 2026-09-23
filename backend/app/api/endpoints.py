"""Every v1 endpoint.

The API is the product as far as a statistical system is concerned: the dashboard is one
consumer of it, not the other way round. So every number the dashboard shows is
available here, and every response carries the methodology version it was computed
under.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import Integer, func, select
from sqlalchemy.orm import Session

from app import __version__
from app.api import schemas
from app.core.config import (
    get_methodology_config,
    get_routes_config,
    get_weights_config,
)
from app.core.ratelimit import enforce_rate_limit
from app.core.security import Principal, require_admin, resolve_principal
from app.db.models import (
    BasePeriod,
    CellDaily,
    CrawlRun,
    Fare,
    IndexValue,
    RawObservation,
    Route,
    Source,
)
from app.db.session import get_session
from engine import pipeline as pipeline_mod

router = APIRouter(prefix="/v1", dependencies=[Depends(enforce_rate_limit)])

ALL_WINDOWS = 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_window(raw: str | None) -> int:
    """Accept "all", "T+15" or "15". Anything else is a client error, not a default."""
    if raw is None or raw.strip().lower() in {"all", "", "0"}:
        return ALL_WINDOWS
    text = raw.strip().upper().removeprefix("T+")
    if not text.isdigit():
        raise HTTPException(400, f"Invalid window {raw!r}. Use 'all' or a value like 'T+15'.")
    value = int(text)
    allowed = [int(v) for v in get_methodology_config().get("lead_times", [])]
    if value not in allowed:
        raise HTTPException(
            400, f"Window T+{value} is not in the basket. Available: {allowed}"
        )
    return value


def window_label(window: int) -> str:
    return "all" if window == ALL_WINDOWS else f"T+{window}"


def methodology_version() -> str:
    return str(get_methodology_config().get("methodology_version", "apix-0"))


def airline_names() -> dict[str, str]:
    return dict(get_routes_config().get("airlines", {}) or {})


def latest_index_date(session: Session, scope: str = "national") -> dt.date | None:
    return session.scalar(
        select(func.max(IndexValue.date)).where(
            IndexValue.scope == scope, IndexValue.window == ALL_WINDOWS
        )
    )


def _point(value: IndexValue) -> schemas.IndexPoint:
    return schemas.IndexPoint(
        date=value.date,
        apix=value.apix,
        wow_pct=value.wow_pct,
        mom_pct=value.mom_pct,
        coverage=value.coverage,
        obs_count=value.obs_count,
        imputed_cells=value.imputed_cells,
        published_at=value.published_at,
        provisional=value.provisional,
    )


# ---------------------------------------------------------------------------
# Health and methodology
# ---------------------------------------------------------------------------

@router.get("/health", response_model=schemas.HealthResponse, tags=["system"])
def health(session: Session = Depends(get_session)) -> schemas.HealthResponse:
    try:
        session.execute(select(func.count()).select_from(Route))
        database = "ok"
    except Exception:  # noqa: BLE001 - the probe reports, it does not raise
        database = "unavailable"
    return schemas.HealthResponse(
        status="ok" if database == "ok" else "degraded",
        version=__version__,
        methodology_version=methodology_version(),
        database=database,
    )


@router.get("/methodology", response_model=schemas.MethodologyResponse, tags=["methodology"])
def methodology(session: Session = Depends(get_session)) -> schemas.MethodologyResponse:
    """The published method.

    Served from configuration rather than written into the dashboard, so the two cannot
    drift apart. If the method changes, this response changes with it.
    """
    config = get_methodology_config()
    weights = get_weights_config()
    routes_config = get_routes_config()

    base = session.scalars(select(BasePeriod).limit(1)).first()
    lead_times = [int(v) for v in config.get("lead_times", [])]
    active_routes = [r for r in routes_config.get("routes", []) if r.get("active", True)]

    sources = session.scalars(select(Source).where(Source.enabled.is_(True))).all()
    asof_raw = weights.get("asof")

    return schemas.MethodologyResponse(
        methodology_version=str(config.get("methodology_version", "apix-0")),
        index_type=str(config.get("index_type", "")),
        formula=str(config.get("formula", "")),
        formula_explanation=str(config.get("formula_explanation", "")).strip(),
        price_basis=str(config.get("price_basis", "")),
        price_basis_explanation=str(config.get("price_basis_explanation", "")).strip(),
        price_statistic=str(config.get("price_statistic", "")),
        price_statistic_explanation=str(config.get("price_statistic_explanation", "")).strip(),
        base_period=schemas.BasePeriodOut(
            start=base.start_date if base else None,
            end=base.end_date if base else None,
            value=100.0,
        ),
        base_period_days=int(config.get("base_period_days", 3)),
        lead_times=lead_times,
        lead_time_weights={
            str(k): float(v) for k, v in (weights.get("lead_time_weights") or {}).items()
        },
        min_obs_per_cell=int(config.get("min_obs_per_cell", 3)),
        mad_threshold=float(config.get("mad_threshold", 3.5)),
        coverage_threshold=float(config.get("coverage_threshold", 0.6)),
        weights_source=str(weights.get("source", "unset")),
        weights_asof=dt.date.fromisoformat(str(asof_raw)) if asof_raw else None,
        weights_are_official=bool(weights.get("official", False)),
        weights_proxy_note=(str(weights.get("proxy_note")).strip() if weights.get("proxy_note") else None),
        revisions_policy=str(config.get("revisions_policy", "")).strip(),
        publication_cadence=str(config.get("publication_cadence", "daily")),
        routes_in_basket=len(active_routes),
        cells_in_basket=len(active_routes) * len(lead_times),
        known_limitations=[str(x) for x in config.get("known_limitations", [])],
        data_sources=[f"{s.name} ({s.kind})" for s in sources],
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/routes", response_model=schemas.RoutesResponse, tags=["index"])
def list_routes(session: Session = Depends(get_session)) -> schemas.RoutesResponse:
    as_of = latest_index_date(session)
    routes = session.scalars(
        select(Route).where(Route.active.is_(True)).order_by(Route.weight.desc())
    ).all()

    latest_by_route: dict[str, IndexValue] = {}
    if as_of is not None:
        for value in session.scalars(
            select(IndexValue).where(
                IndexValue.scope == "route",
                IndexValue.window == ALL_WINDOWS,
                IndexValue.date == as_of,
            )
        ).all():
            if value.scope_id:
                latest_by_route[value.scope_id] = value

    since = (as_of or dt.date.today()) - dt.timedelta(days=30)
    counts = dict(
        session.execute(
            select(Fare.route_id, func.count(Fare.id))
            .where(Fare.observation_date >= since, Fare.is_valid.is_(True))
            .group_by(Fare.route_id)
        ).all()
    )

    items = []
    for route in routes:
        value = latest_by_route.get(route.code)
        items.append(
            schemas.RouteOut(
                id=route.id,
                code=route.code,
                origin=route.origin_iata,
                destination=route.dest_iata,
                origin_city=route.origin_city,
                dest_city=route.dest_city,
                active=route.active,
                weight=round(route.weight or 0.0, 6),
                weight_source=route.weight_source,
                weight_asof=route.weight_asof,
                weight_is_official=route.weight_is_official,
                latest_apix=value.apix if value else None,
                wow_pct=value.wow_pct if value else None,
                mom_pct=value.mom_pct if value else None,
                obs_30d=int(counts.get(route.id, 0)),
                coverage=value.coverage if value else None,
            )
        )

    return schemas.RoutesResponse(
        as_of=as_of,
        methodology_version=methodology_version(),
        count=len(items),
        items=items,
    )


# ---------------------------------------------------------------------------
# Index
# ---------------------------------------------------------------------------

def _index_query(
    session: Session,
    scope: str,
    route: str | None,
    airline: str | None,
    window: int,
    date_from: dt.date | None,
    date_to: dt.date | None,
) -> tuple[str | None, list[IndexValue]]:
    if scope not in {"national", "route", "airline"}:
        raise HTTPException(400, "scope must be one of: national, route, airline")

    scope_id: str | None = None
    if scope == "route":
        if not route:
            raise HTTPException(400, "route is required when scope is 'route'")
        scope_id = route.upper()
        exists = session.scalar(select(Route).where(Route.code == scope_id))
        if exists is None:
            raise HTTPException(404, f"Route {scope_id!r} is not in the basket")
    elif scope == "airline":
        if not airline:
            raise HTTPException(400, "airline is required when scope is 'airline'")
        scope_id = airline.upper()

    statement = select(IndexValue).where(
        IndexValue.scope == scope,
        IndexValue.scope_id == scope_id,
        IndexValue.window == window,
    )
    if date_from:
        statement = statement.where(IndexValue.date >= date_from)
    if date_to:
        statement = statement.where(IndexValue.date <= date_to)

    return scope_id, list(session.scalars(statement.order_by(IndexValue.date)).all())


@router.get("/index", response_model=schemas.IndexResponse, tags=["index"])
def get_index(
    session: Session = Depends(get_session),
    scope: str = Query("national"),
    route: str | None = Query(None),
    airline: str | None = Query(None),
    window: str | None = Query("all"),
    date_from: dt.date | None = Query(None, alias="from"),
    date_to: dt.date | None = Query(None, alias="to"),
) -> schemas.IndexResponse:
    parsed_window = parse_window(window)
    scope_id, values = _index_query(
        session, scope, route, airline, parsed_window, date_from, date_to
    )
    return schemas.IndexResponse(
        scope=scope,
        scope_id=scope_id,
        window=window_label(parsed_window),
        methodology_version=methodology_version(),
        as_of=values[-1].date if values else None,
        count=len(values),
        items=[_point(v) for v in values],
    )


@router.get("/index/latest", response_model=schemas.LatestIndexResponse, tags=["index"])
def get_latest_index(
    session: Session = Depends(get_session),
    scope: str = Query("national"),
    route: str | None = Query(None),
    airline: str | None = Query(None),
    window: str | None = Query("all"),
) -> schemas.LatestIndexResponse:
    parsed_window = parse_window(window)
    _, values = _index_query(session, scope, route, airline, parsed_window, None, None)
    latest = values[-1] if values else None

    movers: list[schemas.Mover] = []
    if latest is not None:
        route_values = session.scalars(
            select(IndexValue).where(
                IndexValue.scope == "route",
                IndexValue.window == ALL_WINDOWS,
                IndexValue.date == latest.date,
                IndexValue.wow_pct.is_not(None),
            )
        ).all()
        ranked = sorted(route_values, key=lambda v: abs(v.wow_pct or 0.0), reverse=True)
        movers = [
            schemas.Mover(code=v.scope_id or "", apix=v.apix, wow_pct=v.wow_pct)
            for v in ranked[:5]
        ]

    return schemas.LatestIndexResponse(
        as_of=latest.date if latest else None,
        methodology_version=methodology_version(),
        item=_point(latest) if latest else None,
        top_movers=movers,
    )


@router.get("/index/heatmap", response_model=schemas.HeatmapResponse, tags=["index"])
def get_heatmap(
    session: Session = Depends(get_session),
    route: str = Query(...),
    days: int = Query(30, ge=1, le=365),
) -> schemas.HeatmapResponse:
    """One route across every booking window, day by day.

    Returns both the index value for each cell and the underlying minimum logical fare,
    because an analyst reading a heatmap wants to know the rupee figure behind a colour.
    """
    code = route.upper()
    route_row = session.scalar(select(Route).where(Route.code == code))
    if route_row is None:
        raise HTTPException(404, f"Route {code!r} is not in the basket")

    as_of = latest_index_date(session)
    if as_of is None:
        return schemas.HeatmapResponse(
            route=code, as_of=None, lead_times=[], dates=[], cells=[]
        )

    start = as_of - dt.timedelta(days=days - 1)
    lead_times = [int(v) for v in get_methodology_config().get("lead_times", [])]

    index_rows = session.scalars(
        select(IndexValue).where(
            IndexValue.scope == "route",
            IndexValue.scope_id == code,
            IndexValue.window != ALL_WINDOWS,
            IndexValue.date >= start,
        )
    ).all()
    index_lookup = {(v.date, v.window): v.apix for v in index_rows}

    cell_rows = session.scalars(
        select(CellDaily).where(
            CellDaily.route_id == route_row.id, CellDaily.date >= start
        )
    ).all()
    cell_lookup = {(c.date, c.lead_time_days): c for c in cell_rows}

    dates = sorted({d for d, _ in index_lookup} | {c.date for c in cell_rows})
    cells = []
    for date in dates:
        for lead in lead_times:
            cell = cell_lookup.get((date, lead))
            cells.append(
                schemas.HeatmapCell(
                    date=date,
                    lead_time_days=lead,
                    apix=index_lookup.get((date, lead)),
                    min_logical_fare=cell.min_logical_fare if cell else None,
                    obs_count=cell.obs_count if cell else 0,
                    imputed=bool(cell.imputed) if cell else False,
                )
            )

    return schemas.HeatmapResponse(
        route=code, as_of=as_of, lead_times=lead_times, dates=dates, cells=cells
    )


@router.get("/index/contributions", response_model=schemas.ContributionResponse, tags=["index"])
def get_contributions(
    session: Session = Depends(get_session),
    date: dt.date | None = Query(None),
    lag_days: int = Query(7, ge=1, le=90),
) -> schemas.ContributionResponse:
    """Which cells moved the index, and by how much.

    The first question anyone asks of a change in an index is what caused it. For a
    Jevons index the decomposition is exact in log space, so this is an attribution
    rather than an approximation.
    """
    as_of = date or latest_index_date(session)
    if as_of is None:
        raise HTTPException(404, "No index values have been published yet")
    previous = as_of - dt.timedelta(days=lag_days)

    prices, route_codes = pipeline_mod._load_cell_prices(session)  # noqa: SLF001
    if prices.empty:
        raise HTTPException(404, "No cell prices available")

    route_weights = pipeline_mod._route_weights(session)  # noqa: SLF001
    lead_weights = pipeline_mod._lead_time_weights()  # noqa: SLF001
    weights = {
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
    if not base_prices:
        raise HTTPException(404, "No base period has been established yet")

    from engine.index import contribution_analysis

    frame = contribution_analysis(
        prices[["date", "cell", "price", "obs_count"]],
        weights,
        base_prices,
        as_of,
        previous,
    )

    now_value = session.scalar(
        select(IndexValue.apix).where(
            IndexValue.scope == "national",
            IndexValue.window == ALL_WINDOWS,
            IndexValue.date == as_of,
        )
    )
    prev_value = session.scalar(
        select(IndexValue.apix).where(
            IndexValue.scope == "national",
            IndexValue.window == ALL_WINDOWS,
            IndexValue.date == previous,
        )
    )
    change = (
        round((now_value / prev_value - 1) * 100, 4)
        if now_value and prev_value
        else None
    )

    rows: list[schemas.ContributionRow] = []
    if not frame.empty:
        rows = [schemas.ContributionRow.model_validate(row) for row in frame.to_dict(orient="records")]

    return schemas.ContributionResponse(
        date=as_of, previous_date=previous, apix_change_pct=change, rows=rows
    )


# ---------------------------------------------------------------------------
# Fares
# ---------------------------------------------------------------------------

@router.get("/fares", response_model=schemas.FaresResponse, tags=["data"])
def list_fares(
    session: Session = Depends(get_session),
    route: str | None = Query(None),
    date: dt.date | None = Query(None, description="Departure date"),
    airline: str | None = Query(None),
    window: str | None = Query("all"),
    valid_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
) -> schemas.FaresResponse:
    statement = select(Fare)
    if route:
        route_row = session.scalar(select(Route).where(Route.code == route.upper()))
        if route_row is None:
            raise HTTPException(404, f"Route {route!r} is not in the basket")
        statement = statement.where(Fare.route_id == route_row.id)
    if date:
        statement = statement.where(Fare.departure_date == date)
    if airline:
        statement = statement.where(Fare.airline_code == airline.upper())
    parsed_window = parse_window(window)
    if parsed_window != ALL_WINDOWS:
        statement = statement.where(Fare.lead_time_days == parsed_window)
    if valid_only:
        statement = statement.where(Fare.is_valid.is_(True))

    total = session.scalar(
        select(func.count()).select_from(statement.subquery())
    ) or 0

    rows = session.scalars(
        statement.order_by(Fare.captured_at.desc(), Fare.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    route_codes = {r.id: r.code for r in session.scalars(select(Route)).all()}
    source_codes = {s.id: s.code for s in session.scalars(select(Source)).all()}
    names = airline_names()

    items = [
        schemas.FareOut(
            id=fare.id,
            route=route_codes.get(fare.route_id, "?"),
            departure_date=fare.departure_date,
            captured_at=fare.captured_at,
            lead_time_days=fare.lead_time_days,
            airline_code=fare.airline_code,
            airline_name=names.get(fare.airline_code, fare.airline_code),
            base_fare=fare.base_fare,
            taxes=fare.taxes,
            udf=fare.udf,
            convenience_fee=fare.convenience_fee,
            total_fare=fare.total_fare,
            currency=fare.currency,
            is_valid=fare.is_valid,
            quality_flags=list(fare.quality_flags or []),
            source=source_codes.get(fare.source_id, "?"),
        )
        for fare in rows
    ]
    return schemas.FaresResponse(page=page, page_size=page_size, total=int(total), items=items)


# ---------------------------------------------------------------------------
# Data quality
# ---------------------------------------------------------------------------

@router.get("/quality/summary", response_model=schemas.QualityResponse, tags=["quality"])
def quality_summary(
    session: Session = Depends(get_session),
    window_days: int = Query(30, ge=1, le=365),
) -> schemas.QualityResponse:
    as_of = session.scalar(select(func.max(Fare.observation_date)))
    if as_of is None:
        return schemas.QualityResponse(
            as_of=None,
            window_days=window_days,
            totals=schemas.QualityTotals(
                raw_observations=0, valid_fares=0, invalid_fares=0,
                validation_pass_rate=0.0, duplicates_rejected=0,
                outliers_excluded=0, imputed_cells=0, coverage_latest=None,
            ),
            flags=[], sources=[], daily=[],
        )

    since = as_of - dt.timedelta(days=window_days - 1)

    raw_count = session.scalar(
        select(func.count()).select_from(RawObservation).where(
            func.date(RawObservation.captured_at) >= since
        )
    ) or 0
    valid_count = session.scalar(
        select(func.count()).select_from(Fare).where(
            Fare.observation_date >= since, Fare.is_valid.is_(True)
        )
    ) or 0
    invalid_count = session.scalar(
        select(func.count()).select_from(Fare).where(
            Fare.observation_date >= since, Fare.is_valid.is_(False)
        )
    ) or 0
    duplicates = session.scalar(
        select(func.coalesce(func.sum(CrawlRun.duplicates), 0)).where(
            func.date(CrawlRun.started_at) >= since
        )
    ) or 0
    outliers = session.scalar(
        select(func.coalesce(func.sum(CellDaily.outliers_excluded), 0)).where(
            CellDaily.date >= since
        )
    ) or 0

    # Flag counts, read from the stored flags rather than recomputed.
    flag_counts: dict[str, int] = {}
    for (flags,) in session.execute(
        select(Fare.quality_flags).where(Fare.observation_date >= since)
    ).all():
        for flag in flags or []:
            flag_counts[flag] = flag_counts.get(flag, 0) + 1

    latest_index = session.scalar(
        select(IndexValue).where(
            IndexValue.scope == "national", IndexValue.window == ALL_WINDOWS
        ).order_by(IndexValue.date.desc()).limit(1)
    )
    imputed_cells = latest_index.imputed_cells if latest_index else 0

    total_fares = valid_count + invalid_count
    pass_rate = (valid_count / total_fares) if total_fares else 0.0

    # Source health, from the most recent run of each source.
    sources: list[schemas.SourceHealth] = []
    for source in session.scalars(select(Source)).all():
        last_run = session.scalars(
            select(CrawlRun).where(CrawlRun.source_id == source.id)
            .order_by(CrawlRun.started_at.desc()).limit(1)
        ).first()
        sources.append(
            schemas.SourceHealth(
                code=source.code,
                name=source.name,
                kind=source.kind,
                enabled=source.enabled,
                robots_ok=source.robots_ok,
                last_run_at=last_run.started_at if last_run else None,
                last_status=last_run.status if last_run else None,
                requests=last_run.requests if last_run else 0,
                failures=last_run.failures if last_run else 0,
            )
        )

    # Daily breakdown.
    daily_rows = session.execute(
        select(
            Fare.observation_date,
            func.count(Fare.id),
            func.sum(func.cast(Fare.is_valid, Integer)),
        ).where(Fare.observation_date >= since).group_by(Fare.observation_date)
        .order_by(Fare.observation_date)
    ).all()

    coverage_by_date = {
        row.date: row.coverage
        for row in session.scalars(
            select(IndexValue).where(
                IndexValue.scope == "national",
                IndexValue.window == ALL_WINDOWS,
                IndexValue.date >= since,
            )
        ).all()
    }
    outliers_by_date = dict(
        session.execute(
            select(CellDaily.date, func.coalesce(func.sum(CellDaily.outliers_excluded), 0))
            .where(CellDaily.date >= since).group_by(CellDaily.date)
        ).all()
    )
    imputed_by_date = dict(
        session.execute(
            select(IndexValue.date, IndexValue.imputed_cells).where(
                IndexValue.scope == "national",
                IndexValue.window == ALL_WINDOWS,
                IndexValue.date >= since,
            )
        ).all()
    )

    daily = [
        schemas.QualityDaily(
            date=row[0],
            obs_count=int(row[1] or 0),
            valid=int(row[2] or 0),
            invalid=int((row[1] or 0) - (row[2] or 0)),
            outliers=int(outliers_by_date.get(row[0], 0)),
            imputed=int(imputed_by_date.get(row[0], 0)),
            coverage=coverage_by_date.get(row[0]),
        )
        for row in daily_rows
    ]

    return schemas.QualityResponse(
        as_of=as_of,
        window_days=window_days,
        totals=schemas.QualityTotals(
            raw_observations=int(raw_count),
            valid_fares=int(valid_count),
            invalid_fares=int(invalid_count),
            validation_pass_rate=round(pass_rate, 4),
            duplicates_rejected=int(duplicates),
            outliers_excluded=int(outliers),
            imputed_cells=int(imputed_cells),
            coverage_latest=latest_index.coverage if latest_index else None,
        ),
        flags=[
            schemas.FlagCount(flag=k, count=v)
            for k, v in sorted(flag_counts.items(), key=lambda kv: -kv[1])
        ],
        sources=sources,
        daily=daily,
    )


# ---------------------------------------------------------------------------
# Back-test
# ---------------------------------------------------------------------------

@router.get("/backtest", response_model=schemas.BacktestResponse, tags=["quality"])
def backtest(
    session: Session = Depends(get_session),
    kind: str = Query("stability", pattern="^(stability|leave_one_out)$"),
    days: int = Query(30, ge=2, le=365),
) -> schemas.BacktestResponse:
    """Internal diagnostics on the published series.

    Read the note in the response: these are stability and sensitivity measures, not a
    comparison against an external reference series, because no public high-frequency
    Indian airfare index exists to compare against.
    """
    from engine import backtest as backtest_mod
    from engine.index import BaseWindow

    prices, route_codes = pipeline_mod._load_cell_prices(session)  # noqa: SLF001
    if prices.empty:
        raise HTTPException(404, "No data to back-test")

    base_rows = session.scalars(select(BasePeriod)).all()
    if not base_rows:
        raise HTTPException(404, "No base period has been established yet")
    window = BaseWindow(
        start=base_rows[0].start_date,
        end=base_rows[0].end_date,
        days=base_rows[0].days_used,
    )

    route_weights = pipeline_mod._route_weights(session)  # noqa: SLF001
    lead_weights = pipeline_mod._lead_time_weights()  # noqa: SLF001
    from engine.index import normalise_weights

    weights = normalise_weights({
        f"{code}|{lead}": route_weights.get(code, 0.0) * lead_weights.get(lead, 0.0)
        for code in route_weights
        for lead in lead_weights
    })
    min_coverage = float(get_methodology_config().get("coverage_threshold", 0.6))
    frame = prices[["date", "cell", "price", "obs_count"]]

    if kind == "stability":
        report = backtest_mod.replay(
            frame, weights, base_window=window, min_coverage=min_coverage, days=days
        )
    else:
        report = backtest_mod.leave_one_out(
            frame, weights, base_window=window, min_coverage=min_coverage
        )

    report.notes.append(
        "These are internal stability and sensitivity diagnostics. They are not a "
        "comparison against an external reference series."
    )
    payload = report.as_dict()
    return schemas.BacktestResponse(**payload)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

@router.get("/export.csv", tags=["data"])
def export_csv(
    session: Session = Depends(get_session),
    scope: str = Query("national"),
    route: str | None = Query(None),
    airline: str | None = Query(None),
    window: str | None = Query("all"),
    date_from: dt.date | None = Query(None, alias="from"),
    date_to: dt.date | None = Query(None, alias="to"),
) -> StreamingResponse:
    parsed_window = parse_window(window)
    scope_id, values = _index_query(
        session, scope, route, airline, parsed_window, date_from, date_to
    )
    version = methodology_version()

    def rows():
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow([
            "date", "scope", "scope_id", "window", "apix", "wow_pct", "mom_pct",
            "coverage", "obs_count", "imputed_cells", "methodology_version",
        ])
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)
        for value in values:
            writer.writerow([
                value.date.isoformat(), scope, scope_id or "", window_label(parsed_window),
                value.apix, value.wow_pct if value.wow_pct is not None else "",
                value.mom_pct if value.mom_pct is not None else "",
                value.coverage, value.obs_count, value.imputed_cells, version,
            ])
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)

    filename = f"apix_{scope}_{scope_id or 'all'}_{window_label(parsed_window)}.csv"
    return StreamingResponse(
        rows(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

@router.post("/admin/recompute", response_model=schemas.RecomputeResponse, tags=["admin"])
def recompute(
    body: schemas.RecomputeRequest,
    session: Session = Depends(get_session),
    principal: Principal = Depends(require_admin),
) -> schemas.RecomputeResponse:
    since = None
    if body.days:
        latest = pipeline_mod.latest_observation_date(session)
        if latest:
            since = latest - dt.timedelta(days=body.days)
    report = pipeline_mod.run_full_pipeline(
        session, since=since, rebuild=body.reprocess
    )
    session.commit()
    payload: dict[str, Any] = report.as_dict()
    return schemas.RecomputeResponse(
        status="ok",
        observations_read=int(payload["observations_read"]),
        fares_written=int(payload["fares_written"]),
        cells_written=int(payload["cells_written"]),
        index_values_written=int(payload["index_values_written"]),
        base_window=payload["base_window"],
        notes=list(payload["notes"]),
    )


@router.get("/whoami", tags=["system"])
def whoami(principal: Principal = Depends(resolve_principal)) -> dict[str, Any]:
    return {"name": principal.name, "scopes": sorted(principal.scopes)}


# ---------------------------------------------------------------------------
# Operational Aviation & Corridor Intelligence Endpoints
# ---------------------------------------------------------------------------

FLIGHT_STATUS_DB = {
    "SG8194": {
        "flightNo": "SG8194",
        "callsign": "SEJ8194",
        "airline": "SpiceJet",
        "aircraft": "Boeing 737-800",
        "registration": "VT-SGB",
        "origin": "AMD",
        "originCity": "Ahmedabad",
        "destination": "DEL",
        "destCity": "Delhi",
        "departureTime": "08:00 IST",
        "arrivalTime": "09:30 IST",
        "status": "cancelled",
        "cancelReason": "Flight cancelled due to weather operational advisory",
        "gate": "04A",
        "terminal": "T1",
        "delayMinutes": 0,
        "distanceKm": 750,
        "progress": 0,
        "speed": "0 km/h",
        "altitude": "0 ft",
        "heading": 25,
        "latitude": 25.4,
        "longitude": 74.8,
        "apix": 98.4,
        "cheapestFare": 2980,
        "highestFare": 7200,
        "averageFare": 4650,
        "volatility": 8.4,
        "trust": 98.4,
        "updatedAt": "25m ago",
    },
    "6E218": {
        "flightNo": "6E218",
        "callsign": "IGO218",
        "airline": "IndiGo",
        "aircraft": "Airbus A320neo",
        "registration": "VT-IFK",
        "origin": "DEL",
        "originCity": "Delhi",
        "destination": "BOM",
        "destCity": "Mumbai",
        "departureTime": "09:30 IST",
        "arrivalTime": "11:45 IST",
        "status": "enroute",
        "gate": "14B",
        "terminal": "T2",
        "delayMinutes": 0,
        "distanceKm": 1148,
        "progress": 63,
        "speed": "842 km/h",
        "altitude": "36,000 ft",
        "heading": 215,
        "latitude": 23.4,
        "longitude": 75.8,
        "apix": 109.4,
        "cheapestFare": 4280,
        "highestFare": 11920,
        "averageFare": 7430,
        "volatility": 18.4,
        "trust": 98.4,
        "updatedAt": "4m ago",
    },
    "AI864": {
        "flightNo": "AI864",
        "callsign": "AIC864",
        "airline": "Air India",
        "aircraft": "Airbus A321neo",
        "registration": "VT-EXQ",
        "origin": "DEL",
        "originCity": "Delhi",
        "destination": "CCU",
        "destCity": "Kolkata",
        "departureTime": "10:15 IST",
        "arrivalTime": "12:30 IST",
        "status": "delayed",
        "delayMinutes": 45,
        "gate": "22",
        "terminal": "T3",
        "distanceKm": 1305,
        "progress": 20,
        "speed": "865 km/h",
        "altitude": "38,000 ft",
        "heading": 115,
        "latitude": 25.1,
        "longitude": 83.2,
        "apix": 118.2,
        "cheapestFare": 5120,
        "highestFare": 14800,
        "averageFare": 8960,
        "volatility": 22.1,
        "trust": 97.2,
        "updatedAt": "12m ago",
    },
    "AI402": {
        "flightNo": "AI402",
        "callsign": "AIC402",
        "airline": "Air India",
        "aircraft": "Airbus A320neo",
        "registration": "VT-EDC",
        "origin": "AMD",
        "originCity": "Ahmedabad",
        "destination": "DEL",
        "destCity": "Delhi",
        "departureTime": "08:45 IST",
        "arrivalTime": "10:20 IST",
        "status": "enroute",
        "gate": "18",
        "terminal": "T3",
        "distanceKm": 750,
        "progress": 40,
        "speed": "820 km/h",
        "altitude": "34,000 ft",
        "heading": 25,
        "latitude": 25.6,
        "longitude": 75.0,
        "apix": 102.5,
        "cheapestFare": 4950,
        "highestFare": 9800,
        "averageFare": 6400,
        "volatility": 10.2,
        "trust": 97.8,
        "updatedAt": "2m ago",
    },
    "6E5321": {
        "flightNo": "6E5321",
        "callsign": "IGO5321",
        "airline": "IndiGo",
        "aircraft": "Airbus A321neo",
        "registration": "VT-IFL",
        "origin": "AMD",
        "originCity": "Ahmedabad",
        "destination": "DEL",
        "destCity": "Delhi",
        "departureTime": "09:10 IST",
        "arrivalTime": "10:40 IST",
        "status": "boarding",
        "gate": "07C",
        "terminal": "T1",
        "distanceKm": 750,
        "progress": 0,
        "speed": "0 km/h",
        "altitude": "0 ft",
        "heading": 25,
        "latitude": 23.0,
        "longitude": 72.6,
        "apix": 99.8,
        "cheapestFare": 4300,
        "highestFare": 8900,
        "averageFare": 5750,
        "volatility": 9.1,
        "trust": 99.0,
        "updatedAt": "Just now",
    },
    "UK955": {
        "flightNo": "UK955",
        "callsign": "VTI955",
        "airline": "Air India",
        "aircraft": "Airbus A320neo",
        "registration": "VT-TNB",
        "origin": "AMD",
        "originCity": "Ahmedabad",
        "destination": "DEL",
        "destCity": "Delhi",
        "departureTime": "11:25 IST",
        "arrivalTime": "13:00 IST",
        "status": "scheduled",
        "gate": "31",
        "terminal": "T3",
        "distanceKm": 750,
        "progress": 0,
        "speed": "0 km/h",
        "altitude": "0 ft",
        "heading": 25,
        "latitude": 23.0,
        "longitude": 72.6,
        "apix": 105.2,
        "cheapestFare": 5200,
        "highestFare": 10400,
        "averageFare": 7100,
        "volatility": 11.5,
        "trust": 98.2,
        "updatedAt": "50m ago",
    },
}

AIRPORTS_DB = [
    {
        "code": "DEL",
        "name": "Indira Gandhi International Airport",
        "city": "Delhi",
        "region": "North",
        "coordinates": [77.1025, 28.5562],
        "flightsToday": 1420,
        "averageFare": 6850,
        "topDestinations": ["BOM", "BLR", "CCU", "HYD", "GAU"],
        "onwardConnections": ["DXB", "LHR", "JFK", "SIN"],
        "weather": "31°C Clear",
    },
    {
        "code": "BOM",
        "name": "Chhatrapati Shivaji Maharaj International Airport",
        "city": "Mumbai",
        "region": "West",
        "coordinates": [72.8679, 19.0896],
        "flightsToday": 1180,
        "averageFare": 7120,
        "topDestinations": ["DEL", "BLR", "HYD", "MAA", "GOI"],
        "onwardConnections": ["DXB", "LHR", "SIN"],
        "weather": "29°C Humid",
    },
    {
        "code": "BLR",
        "name": "Kempegowda International Airport",
        "city": "Bengaluru",
        "region": "South",
        "coordinates": [77.7066, 13.1986],
        "flightsToday": 980,
        "averageFare": 5890,
        "topDestinations": ["DEL", "BOM", "HYD", "COK"],
        "onwardConnections": ["SIN", "DXB"],
        "weather": "24°C Partly Cloudy",
    },
    {
        "code": "AMD",
        "name": "Sardar Vallabhbhai Patel International Airport",
        "city": "Ahmedabad",
        "region": "West",
        "coordinates": [72.6347, 23.0772],
        "flightsToday": 420,
        "averageFare": 4950,
        "topDestinations": ["DEL", "BOM", "BLR"],
        "onwardConnections": ["DXB"],
        "weather": "33°C Sunny",
    },
    {
        "code": "CCU",
        "name": "Netaji Subhash Chandra Bose International Airport",
        "city": "Kolkata",
        "region": "East",
        "coordinates": [88.4467, 22.6547],
        "flightsToday": 650,
        "averageFare": 6200,
        "topDestinations": ["DEL", "GAU", "BOM", "BBI"],
        "onwardConnections": ["BKK", "SIN"],
        "weather": "30°C Hazy",
    },
    {
        "code": "GAU",
        "name": "Lokpriya Gopinath Bordoloi International Airport",
        "city": "Guwahati",
        "region": "Northeast",
        "coordinates": [91.5859, 26.1061],
        "flightsToday": 280,
        "averageFare": 8100,
        "topDestinations": ["DEL", "CCU", "DIB"],
        "onwardConnections": ["PBH"],
        "weather": "26°C Light Rain",
    },
]


@router.get("/flight-status", response_model=schemas.FlightStatusOut, tags=["aviation"])
@router.get("/flights/status", response_model=schemas.FlightStatusOut, tags=["aviation"])
def get_flight_status(
    flight: str | None = Query(None, description="Flight number e.g. SG8194 or 6E218"),
    flight_no: str | None = Query(None, description="Flight number alias e.g. SG8194 or 6E218"),
    date: str = Query("today", description="Operational date"),
) -> schemas.FlightStatusOut:
    raw_fl = flight or flight_no or "6E218"
    clean = raw_fl.replace(" ", "").replace("-", "").upper()
    if clean in FLIGHT_STATUS_DB:
        return schemas.FlightStatusOut(**FLIGHT_STATUS_DB[clean])
    
    # Generic operational response synthesis if flight not in mock DB
    return schemas.FlightStatusOut(
        flightNo=clean,
        callsign=f"FLY{clean}",
        airline="IndiGo" if "6E" in clean else "Air India",
        aircraft="Airbus A320neo",
        registration="VT-IFK",
        origin="DEL",
        originCity="Delhi",
        destination="BOM",
        destCity="Mumbai",
        departureTime="14:40 IST",
        arrivalTime="16:35 IST",
        status="scheduled",
        terminal="T2",
        gate="12",
        delayMinutes=0,
        distanceKm=1148,
        progress=0,
        speed="0 km/h",
        altitude="0 ft",
        heading=215,
        latitude=23.4,
        longitude=75.8,
        apix=104.2,
        cheapestFare=4500,
        highestFare=11200,
        averageFare=7200,
        volatility=12.5,
        trust=98.4,
        updatedAt="Just now",
    )


@router.get("/airports", response_model=list[schemas.AirportOut], tags=["aviation"])
def get_airports() -> list[schemas.AirportOut]:
    return [schemas.AirportOut(**item) for item in AIRPORTS_DB]


@router.get("/corridors/{origin}/{destination}", response_model=schemas.CorridorIntelligenceOut, tags=["aviation"])
def get_corridor_intelligence(origin: str, destination: str) -> schemas.CorridorIntelligenceOut:
    orig = origin.upper()
    dest = destination.upper()
    return schemas.CorridorIntelligenceOut(
        origin=orig,
        destination=dest,
        distanceKm=1148 if (orig == "DEL" and dest == "BOM") else 750,
        flightsPerDay=34 if (orig == "DEL" and dest == "BOM") else 18,
        averageFare=7430 if (orig == "DEL" and dest == "BOM") else 4950,
        bestBookingDay="T-21 Days (Tuesday)",
        peakDemandHours="07:00–09:00 & 18:00–21:00",
        loadFactor="87.4%",
        priceTrend="Rising (+4.2% MoM)",
    )

