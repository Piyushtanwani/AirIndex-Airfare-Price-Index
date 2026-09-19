"""Database schema.

One module, because the schema is small enough to read in one sitting and the
relationships matter more than the file boundaries.

Portability note: the type aliases at the top keep this working on both SQLite (the
zero-setup default) and PostgreSQL (the deployment target). JSON columns use the generic
SQLAlchemy JSON type, which maps to JSONB on PostgreSQL.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class Source(Base):
    """A place fares come from: an airline site, an aggregator, a licensed feed, or the
    synthetic generator. `robots_ok` is written by the collector's robots gate on every
    run, so a source that starts disallowing collection is visible in the data."""

    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(16))  # airline | ota | feed | synthetic
    base_url: Mapped[str | None] = mapped_column(String(256), default=None)
    robots_ok: Mapped[bool] = mapped_column(Boolean, default=True)
    robots_checked_at: Mapped[dt.datetime | None] = mapped_column(DateTime, default=None)
    tos_url: Mapped[str | None] = mapped_column(String(256), default=None)
    tos_reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    tos_note: Mapped[str | None] = mapped_column(Text, default=None)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_utcnow)

    runs: Mapped[list["CrawlRun"]] = relationship(back_populates="source")


class Route(Base):
    """A city pair in the basket. `weight` is normalised over the active basket and is
    always traceable to `weight_source`."""

    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    origin_iata: Mapped[str] = mapped_column(String(3))
    dest_iata: Mapped[str] = mapped_column(String(3))
    origin_city: Mapped[str] = mapped_column(String(64))
    dest_city: Mapped[str] = mapped_column(String(64))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    distance_km: Mapped[int | None] = mapped_column(Integer, default=None)
    weight: Mapped[float] = mapped_column(Float, default=0.0)
    weight_source: Mapped[str] = mapped_column(String(256), default="unset")
    weight_asof: Mapped[dt.date | None] = mapped_column(Date, default=None)
    weight_is_official: Mapped[bool] = mapped_column(Boolean, default=False)
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class CrawlRun(Base):
    """One execution of one source adapter. Written even when the run fails, so a silent
    source is impossible: a source with no recent successful run shows up in the data
    quality page."""

    __tablename__ = "crawl_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id"), index=True)
    started_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_utcnow, index=True)
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime, default=None)
    status: Mapped[str] = mapped_column(String(16), default="running")
    # running | success | partial | failed | blocked_by_robots | disabled
    requests: Mapped[int] = mapped_column(Integer, default=0)
    failures: Mapped[int] = mapped_column(Integer, default=0)
    observations: Mapped[int] = mapped_column(Integer, default=0)
    duplicates: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text, default=None)

    source: Mapped[Source] = relationship(back_populates="runs")


class RawObservation(Base):
    """A fare exactly as the source presented it, before any interpretation.

    `raw_hash` carries a unique constraint. Deduplication is enforced by the database
    rather than by application logic, because the collector retries and two retries of
    the same page must not become two observations."""

    __tablename__ = "raw_observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int | None] = mapped_column(ForeignKey("crawl_runs.id"), index=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id"), index=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), index=True)
    departure_date: Mapped[dt.date] = mapped_column(Date, index=True)
    captured_at: Mapped[dt.datetime] = mapped_column(DateTime, index=True)
    airline_code: Mapped[str] = mapped_column(String(4))
    flight_no: Mapped[str | None] = mapped_column(String(16), default=None)
    cabin: Mapped[str] = mapped_column(String(16), default="economy")
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    raw_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    __table_args__ = (
        Index("ix_raw_route_dep_cap", "route_id", "departure_date", "captured_at"),
    )


class Fare(Base):
    """A normalised, validated observation. One row per raw observation that survived
    parsing; `is_valid` records whether it is eligible for the index, and
    `quality_flags` records why not."""

    __tablename__ = "fares"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    #: Unique, not merely indexed. The pipeline decides what to process by asking which
    #: raw observations have no fare yet, and a query answers that from whatever snapshot
    #: the connection can see. If that read is ever stale or the pipeline is run twice
    #: concurrently, the guard passes and every fare is written a second time. The index
    #: survives that, because the minimum of a duplicated set is unchanged, but the
    #: observation counts silently double and they feed the quality page and the trust
    #: score. The constraint makes the duplicate impossible rather than unlikely.
    raw_id: Mapped[int | None] = mapped_column(
        ForeignKey("raw_observations.id"), index=True, unique=True
    )
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id"), index=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), index=True)
    departure_date: Mapped[dt.date] = mapped_column(Date, index=True)
    captured_at: Mapped[dt.datetime] = mapped_column(DateTime, index=True)
    observation_date: Mapped[dt.date] = mapped_column(Date, index=True)
    lead_time_days: Mapped[int] = mapped_column(Integer, index=True)
    airline_code: Mapped[str] = mapped_column(String(4), index=True)
    cabin: Mapped[str] = mapped_column(String(16), default="economy")
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    base_fare: Mapped[float] = mapped_column(Float)
    taxes: Mapped[float] = mapped_column(Float, default=0.0)
    udf: Mapped[float] = mapped_column(Float, default=0.0)
    convenience_fee: Mapped[float] = mapped_column(Float, default=0.0)
    total_fare: Mapped[float] = mapped_column(Float, index=True)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    quality_flags: Mapped[list[str]] = mapped_column(JSON, default=list)

    __table_args__ = (
        Index("ix_fare_cell", "route_id", "lead_time_days", "observation_date"),
    )


class CellDaily(Base):
    """One priced cell on one day: the minimum logical fare for a route and lead time.

    This is the layer the index reads. Keeping it separate from `fares` means the index
    can be recomputed without re-deriving minima, and an imputed cell is recorded as
    such instead of quietly inheriting a number."""

    __tablename__ = "cell_daily"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    date: Mapped[dt.date] = mapped_column(Date, index=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), index=True)
    lead_time_days: Mapped[int] = mapped_column(Integer, index=True)
    min_logical_fare: Mapped[float | None] = mapped_column(Float, default=None)
    mean_fare: Mapped[float | None] = mapped_column(Float, default=None)
    obs_count: Mapped[int] = mapped_column(Integer, default=0)
    outliers_excluded: Mapped[int] = mapped_column(Integer, default=0)
    imputed: Mapped[bool] = mapped_column(Boolean, default=False)
    airlines_seen: Mapped[list[str]] = mapped_column(JSON, default=list)

    __table_args__ = (
        UniqueConstraint("date", "route_id", "lead_time_days", name="uq_cell_daily"),
    )


class IndexValue(Base):
    """A published index number.

    `scope` is national, route or airline. `window` is a lead time in days or 0 for the
    all-windows aggregate. Every row records the methodology version it was computed
    under, and a revision points at the value it replaced rather than overwriting it."""

    __tablename__ = "index_values"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    date: Mapped[dt.date] = mapped_column(Date, index=True)
    scope: Mapped[str] = mapped_column(String(16), index=True)
    scope_id: Mapped[str | None] = mapped_column(String(16), index=True, default=None)
    window: Mapped[int] = mapped_column(Integer, default=0, index=True)
    apix: Mapped[float] = mapped_column(Float)
    wow_pct: Mapped[float | None] = mapped_column(Float, default=None)
    mom_pct: Mapped[float | None] = mapped_column(Float, default=None)
    coverage: Mapped[float] = mapped_column(Float, default=0.0)
    obs_count: Mapped[int] = mapped_column(Integer, default=0)
    imputed_cells: Mapped[int] = mapped_column(Integer, default=0)
    provisional: Mapped[bool] = mapped_column(Boolean, default=False)
    methodology_version: Mapped[str] = mapped_column(String(32))
    published_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_utcnow)
    revision_of: Mapped[int | None] = mapped_column(
        ForeignKey("index_values.id"), default=None
    )

    __table_args__ = (
        UniqueConstraint("date", "scope", "scope_id", "window", name="uq_index_value"),
        Index("ix_index_lookup", "scope", "scope_id", "window", "date"),
    )


class BasePeriod(Base):
    """The reference prices each cell is measured against.

    Stored rather than recomputed, because the base is the one thing in the index that
    must not move when the data behind it is reprocessed."""

    __tablename__ = "base_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), index=True)
    lead_time_days: Mapped[int] = mapped_column(Integer, index=True)
    base_fare: Mapped[float] = mapped_column(Float)
    start_date: Mapped[dt.date] = mapped_column(Date)
    end_date: Mapped[dt.date] = mapped_column(Date)
    days_used: Mapped[int] = mapped_column(Integer, default=0)
    methodology_version: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_utcnow)

    __table_args__ = (
        UniqueConstraint("route_id", "lead_time_days", name="uq_base_period_cell"),
    )


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    owner: Mapped[str] = mapped_column(String(128))
    scopes: Mapped[list[str]] = mapped_column(JSON, default=list)
    rate_limit: Mapped[int] = mapped_column(Integer, default=120)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=_utcnow)
    revoked_at: Mapped[dt.datetime | None] = mapped_column(DateTime, default=None)


class AuditLog(Base):
    """Who changed what. Weight changes, recomputations and revisions land here, because
    a statistical series that cannot explain its own history is not usable by a
    statistical office."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    at: Mapped[dt.datetime] = mapped_column(DateTime, default=_utcnow, index=True)
    actor: Mapped[str] = mapped_column(String(64), default="system")
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity: Mapped[str | None] = mapped_column(String(64), default=None)
    entity_id: Mapped[str | None] = mapped_column(String(64), default=None)
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
