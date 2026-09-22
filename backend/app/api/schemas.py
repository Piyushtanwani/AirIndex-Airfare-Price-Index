"""Response models.

These are the published contract. The dashboard is generated against them and an
external consumer will code against them, so a field is not removed or renamed without
a version bump.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    version: str
    methodology_version: str
    database: str


class BasePeriodOut(BaseModel):
    start: dt.date | None
    end: dt.date | None
    value: float = 100.0


class MethodologyResponse(BaseModel):
    methodology_version: str
    index_type: str
    formula: str
    formula_explanation: str
    price_basis: str
    price_basis_explanation: str
    price_statistic: str
    price_statistic_explanation: str
    base_period: BasePeriodOut
    base_period_days: int
    lead_times: list[int]
    lead_time_weights: dict[str, float]
    min_obs_per_cell: int
    mad_threshold: float
    coverage_threshold: float
    weights_source: str
    weights_asof: dt.date | None
    weights_are_official: bool
    weights_proxy_note: str | None = None
    revisions_policy: str
    publication_cadence: str
    routes_in_basket: int
    cells_in_basket: int
    known_limitations: list[str] = Field(default_factory=list)
    data_sources: list[str] = Field(default_factory=list)


class RouteOut(BaseModel):
    id: int
    code: str
    origin: str
    destination: str
    origin_city: str
    dest_city: str
    active: bool
    weight: float
    weight_source: str
    weight_asof: dt.date | None
    weight_is_official: bool
    latest_apix: float | None = None
    wow_pct: float | None = None
    mom_pct: float | None = None
    obs_30d: int = 0
    coverage: float | None = None


class RoutesResponse(BaseModel):
    as_of: dt.date | None
    methodology_version: str
    count: int
    items: list[RouteOut]


class IndexPoint(BaseModel):
    date: dt.date
    apix: float
    wow_pct: float | None = None
    mom_pct: float | None = None
    coverage: float
    obs_count: int
    imputed_cells: int
    published_at: dt.datetime
    provisional: bool


class IndexResponse(BaseModel):
    scope: str
    scope_id: str | None
    window: str
    methodology_version: str
    as_of: dt.date | None
    count: int
    items: list[IndexPoint]


class Mover(BaseModel):
    code: str
    apix: float
    wow_pct: float | None = None


class LatestIndexResponse(BaseModel):
    as_of: dt.date | None
    methodology_version: str
    item: IndexPoint | None
    top_movers: list[Mover] = Field(default_factory=list)


class HeatmapCell(BaseModel):
    date: dt.date
    lead_time_days: int
    apix: float | None
    min_logical_fare: float | None
    obs_count: int
    imputed: bool


class HeatmapResponse(BaseModel):
    route: str
    as_of: dt.date | None
    lead_times: list[int]
    dates: list[dt.date]
    cells: list[HeatmapCell]


class FareOut(BaseModel):
    id: int
    route: str
    departure_date: dt.date
    captured_at: dt.datetime
    lead_time_days: int
    airline_code: str
    airline_name: str
    base_fare: float
    taxes: float
    udf: float
    convenience_fee: float
    total_fare: float
    currency: str
    is_valid: bool
    quality_flags: list[str]
    source: str


class FaresResponse(BaseModel):
    page: int
    page_size: int
    total: int
    items: list[FareOut]


class FlagCount(BaseModel):
    flag: str
    count: int


class SourceHealth(BaseModel):
    code: str
    name: str
    kind: str
    enabled: bool
    robots_ok: bool
    last_run_at: dt.datetime | None
    last_status: str | None
    requests: int
    failures: int


class QualityDaily(BaseModel):
    date: dt.date
    obs_count: int
    valid: int
    invalid: int
    outliers: int
    imputed: int
    coverage: float | None


class QualityTotals(BaseModel):
    raw_observations: int
    valid_fares: int
    invalid_fares: int
    validation_pass_rate: float
    duplicates_rejected: int
    outliers_excluded: int
    imputed_cells: int
    coverage_latest: float | None


class QualityResponse(BaseModel):
    as_of: dt.date | None
    window_days: int
    totals: QualityTotals
    flags: list[FlagCount]
    sources: list[SourceHealth]
    daily: list[QualityDaily]


class BacktestResponse(BaseModel):
    kind: str
    days: int
    metrics: dict[str, float | str | None]
    series: list[dict[str, Any]]
    notes: list[str]


class RecomputeRequest(BaseModel):
    days: int | None = None
    reprocess: bool = False


class RecomputeResponse(BaseModel):
    status: str
    observations_read: int
    fares_written: int
    cells_written: int
    index_values_written: int
    base_window: list[str] | None
    notes: list[str]


class ContributionRow(BaseModel):
    cell: str
    weight: float
    price_now: float
    price_prev: float
    pct_change: float
    contribution_pct: float


class ContributionResponse(BaseModel):
    date: dt.date
    previous_date: dt.date
    apix_change_pct: float | None
    rows: list[ContributionRow]


class FlightStatusOut(BaseModel):
    flightNo: str
    callsign: str | None = None
    airline: str
    aircraft: str
    registration: str | None = "VT-SGB"
    origin: str
    originCity: str
    destination: str
    destCity: str
    departureTime: str
    arrivalTime: str
    status: str
    cancelReason: str | None = None
    gate: str | None = "TBD"
    terminal: str | None = "T1"
    delayMinutes: int | None = 0
    distanceKm: int = 750
    progress: int = 0
    speed: str = "0 km/h"
    altitude: str = "0 ft"
    heading: int = 0
    latitude: float | None = None
    longitude: float | None = None
    apix: float = 100.0
    cheapestFare: int = 4000
    highestFare: int = 12000
    averageFare: int = 7000
    volatility: float = 12.0
    trust: float = 98.4
    updatedAt: str = "Just now"


class AirportOut(BaseModel):
    code: str
    name: str
    city: str
    region: str
    coordinates: list[float]
    flightsToday: int = 42
    averageFare: int = 5400
    topDestinations: list[str] = Field(default_factory=list)
    onwardConnections: list[str] = Field(default_factory=list)
    weather: str = "28°C Clear"


class CorridorIntelligenceOut(BaseModel):
    origin: str
    destination: str
    distanceKm: int
    flightsPerDay: int
    averageFare: int
    bestBookingDay: str
    peakDemandHours: str
    loadFactor: str
    priceTrend: str

