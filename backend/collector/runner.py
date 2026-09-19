"""The collection runner.

One job: for each enabled source, for each active route, for each booking lead time,
fetch fares and write raw observations. Around that job sit the three things that make
the collection defensible and the data trustworthy.

  - The robots gate runs here, before any adapter is asked for anything. An adapter
    cannot bypass a check it never sees.
  - The request budget and the pacer run here, so no adapter can decide to go faster.
  - Every run writes a CrawlRun row, whatever happens. A source that silently stops
    producing data is the failure mode that quietly ruins an index, so there is no code
    path that collects without leaving a record.

The runner is also what makes historical backfill possible: `captured_at` is a parameter
rather than a call to the clock, so the same code that collects today can generate the
ninety days of history a demonstration needs.
"""

from __future__ import annotations

import datetime as dt
import logging
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_methodology_config, get_routes_config, get_settings
from collector.base import RawRecord, RouteSpec, SourceAdapter
from collector.robots import RobotsGate
from collector.throttle import RequestBudget, TokenBucket
from app.db.models import CrawlRun, RawObservation, Route, Source

logger = logging.getLogger("airindex.collector")


@dataclass
class RunSummary:
    source_code: str
    status: str
    requests: int = 0
    failures: int = 0
    observations: int = 0
    duplicates: int = 0
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        return {
            "source": self.source_code,
            "status": self.status,
            "requests": self.requests,
            "failures": self.failures,
            "observations": self.observations,
            "duplicates": self.duplicates,
            "notes": self.notes,
        }


def build_route_specs() -> list[RouteSpec]:
    """Route specs from configuration, not from the database.

    The adapters are handed plain values so they cannot reach into the database, and so
    the same specs can be used in tests without one.
    """
    config = get_routes_config()
    specs = []
    for entry in config.get("routes", []):
        if not entry.get("active", True):
            continue
        specs.append(
            RouteSpec(
                code=entry["code"],
                origin=entry["origin"],
                destination=entry["destination"],
                origin_city=entry.get("origin_city", ""),
                dest_city=entry.get("dest_city", ""),
                distance_km=entry.get("distance_km"),
                airlines=tuple(entry.get("airlines", ())),
                base_fare_inr=float(entry.get("base_fare_inr", 5000)),
                volatility=float(entry.get("volatility", 0.15)),
            )
        )
    return specs


def resolve_adapters(codes: list[str]) -> list[SourceAdapter]:
    """Instantiate the named adapters, refusing the ones that are not permitted to run.

    Live portal adapters are excluded unless the live flag is set. This is checked here,
    at construction, as well as in the gate below, because two independent refusals are
    better than one when the consequence of a mistake is unauthorised crawling.
    """
    from collector.adapters.feed import LicensedFeedAdapter
    from collector.adapters.live_portal import LIVE_ADAPTERS
    from collector.adapters.synthetic import SyntheticSource

    settings = get_settings()
    adapters: list[SourceAdapter] = []
    for code in codes:
        if code == "synthetic":
            adapters.append(SyntheticSource(seed=settings.synthetic_seed))
        elif code == "feed":
            adapters.append(LicensedFeedAdapter())
        elif code in LIVE_ADAPTERS:
            if not settings.collector_live_adapters_enabled:
                logger.warning(
                    "Source %r requested but live adapters are disabled. Set "
                    "COLLECTOR_LIVE_ADAPTERS_ENABLED=true to enable, after recording a "
                    "Terms of Service review in docs/compliance.md.",
                    code,
                )
                continue
            adapters.append(LIVE_ADAPTERS[code]())
        else:
            logger.warning("Unknown source code %r, ignoring", code)
    return adapters


def ensure_source_row(session: Session, adapter: SourceAdapter) -> Source:
    source = session.scalar(select(Source).where(Source.code == adapter.code))
    if source is None:
        described = adapter.describe()
        source = Source(
            code=adapter.code,
            name=described["name"],
            kind=described["kind"],
            base_url=described["base_url"],
            tos_url=described["tos_url"],
            enabled=True,
        )
        session.add(source)
        session.flush()
    return source


def ensure_routes(session: Session) -> dict[str, Route]:
    """Reconcile the route table with routes.yaml and weights.yaml.

    Weights are normalised over the active basket here and nowhere else, and every route
    records where its weight came from, so a weight can always be traced back to a
    source and an as-of date.
    """
    from app.core.config import get_weights_config

    routes_config = get_routes_config()
    weights_config = get_weights_config()
    shares: dict[str, float] = weights_config.get("route_shares", {}) or {}
    weight_source = weights_config.get("source", "unset")
    weight_official = bool(weights_config.get("official", False))
    asof_raw = weights_config.get("asof")
    weight_asof = (
        dt.date.fromisoformat(str(asof_raw)) if asof_raw else None
    )

    active_entries = [e for e in routes_config.get("routes", []) if e.get("active", True)]
    total_share = sum(float(shares.get(e["code"], 0.0)) for e in active_entries)

    result: dict[str, Route] = {}
    for entry in active_entries:
        code = entry["code"]
        raw_share = float(shares.get(code, 0.0))
        weight = (raw_share / total_share) if total_share > 0 else 0.0

        route = session.scalar(select(Route).where(Route.code == code))
        if route is None:
            route = Route(code=code)
            session.add(route)
        route.origin_iata = entry["origin"]
        route.dest_iata = entry["destination"]
        route.origin_city = entry.get("origin_city", "")
        route.dest_city = entry.get("dest_city", "")
        route.active = True
        route.distance_km = entry.get("distance_km")
        route.weight = round(weight, 8)
        route.weight_source = weight_source
        route.weight_asof = weight_asof
        route.weight_is_official = weight_official
        route.meta = {
            "airlines": entry.get("airlines", []),
            "raw_share": raw_share,
        }
        result[code] = route

    session.flush()
    return result


class Collector:
    """Runs one collection cycle."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.settings = get_settings()
        self.methodology = get_methodology_config()
        self.gate = RobotsGate(user_agent=self.settings.collector_user_agent)
        self.pacer = TokenBucket(rate_per_minute=self.settings.collector_requests_per_minute)

    @property
    def lead_times(self) -> list[int]:
        return [int(v) for v in self.methodology.get("lead_times", [1, 7, 15, 30, 45])]

    def run(
        self,
        captured_at: dt.datetime | None = None,
        source_codes: list[str] | None = None,
        pace: bool = True,
    ) -> list[RunSummary]:
        """Collect once for every enabled source.

        `pace` exists so that backfill against a generator does not sleep between
        thousands of calls that never touch a network. It has no effect on any adapter
        that makes real requests, because those go through the gate and the budget
        regardless.
        """
        captured_at = captured_at or dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
        codes = source_codes or self.settings.enabled_source_list
        adapters = resolve_adapters(codes)
        routes = ensure_routes(self.session)
        specs = build_route_specs()

        summaries: list[RunSummary] = []
        for adapter in adapters:
            summaries.append(self._run_one(adapter, specs, routes, captured_at, pace))
        return summaries

    def _run_one(
        self,
        adapter: SourceAdapter,
        specs: list[RouteSpec],
        routes: dict[str, Route],
        captured_at: dt.datetime,
        pace: bool,
    ) -> RunSummary:
        source = ensure_source_row(self.session, adapter)
        run = CrawlRun(source_id=source.id, started_at=captured_at, status="running")
        self.session.add(run)
        self.session.flush()

        summary = RunSummary(source_code=adapter.code, status="running")
        budget = RequestBudget(self.settings.collector_max_requests_per_run)

        # The gate. Checked once per source per run, against a representative URL.
        if adapter.requires_robots_check and self.settings.collector_respect_robots:
            target = adapter.base_url
            if not target:
                summary.status = "blocked_by_robots"
                summary.notes.append("no base URL to check robots.txt against; failing closed")
                self._finish(run, source, summary, captured_at, robots_ok=False)
                return summary
            decision = self.gate.check(target)
            source.robots_ok = decision.allowed
            source.robots_checked_at = decision.checked_at.replace(tzinfo=None)
            if not decision.allowed:
                summary.status = "blocked_by_robots"
                summary.notes.append(decision.reason)
                logger.warning("Source %s blocked: %s", adapter.code, decision.reason)
                self._finish(run, source, summary, captured_at, robots_ok=False)
                return summary
            if decision.crawl_delay:
                self.pacer.min_interval_override = decision.crawl_delay
            summary.notes.append(decision.reason)
        else:
            source.robots_ok = True
            source.robots_checked_at = captured_at

        try:
            adapter.prepare()
        except Exception as exc:  # noqa: BLE001
            summary.status = "failed"
            summary.notes.append(f"prepare failed: {exc}")
            self._finish(run, source, summary, captured_at, robots_ok=source.robots_ok)
            return summary

        try:
            for spec in specs:
                route_row = routes.get(spec.code)
                if route_row is None:
                    continue
                for lead in self.lead_times:
                    if budget.exhausted:
                        summary.notes.append("request budget exhausted; run truncated")
                        break
                    departure = captured_at.date() + dt.timedelta(days=lead)
                    if pace and adapter.requires_robots_check:
                        self.pacer.wait()
                    budget.spend(1)
                    result = adapter.fetch(spec, departure, captured_at)
                    summary.requests += result.requests_made
                    if not result.ok:
                        summary.failures += 1
                        if result.error and len(summary.notes) < 12:
                            summary.notes.append(f"{spec.code} T+{lead}: {result.error}")
                        continue
                    written, duplicates = self._persist(result.records, run, source, route_row)
                    summary.observations += written
                    summary.duplicates += duplicates
                if budget.exhausted:
                    break
        finally:
            try:
                adapter.teardown()
            except Exception as exc:  # noqa: BLE001
                summary.notes.append(f"teardown failed: {exc}")

        if summary.observations == 0 and summary.failures > 0:
            summary.status = "failed"
        elif summary.failures > 0:
            summary.status = "partial"
        else:
            summary.status = "success"

        self._finish(run, source, summary, captured_at, robots_ok=source.robots_ok)
        return summary

    def _persist(
        self,
        records: list[RawRecord],
        run: CrawlRun,
        source: Source,
        route: Route,
    ) -> tuple[int, int]:
        """Write observations, letting the database reject duplicates.

        Deduplication is a unique constraint rather than a lookup, because a check then
        insert is a race the collector would lose against itself when two sources run
        concurrently.
        """
        written = 0
        duplicates = 0
        for record in records:
            observation = RawObservation(
                run_id=run.id,
                source_id=source.id,
                route_id=route.id,
                departure_date=record.departure_date,
                captured_at=record.captured_at,
                airline_code=record.airline_code,
                flight_no=record.flight_no,
                cabin=record.cabin,
                currency=record.currency,
                payload=record.payload,
                raw_hash=record.fingerprint(),
            )
            savepoint = self.session.begin_nested()
            try:
                self.session.add(observation)
                savepoint.commit()
                written += 1
            except IntegrityError:
                savepoint.rollback()
                duplicates += 1
        return written, duplicates

    def _finish(
        self,
        run: CrawlRun,
        source: Source,
        summary: RunSummary,
        captured_at: dt.datetime,
        robots_ok: bool,
    ) -> None:
        run.finished_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
        run.status = summary.status
        run.requests = summary.requests
        run.failures = summary.failures
        run.observations = summary.observations
        run.duplicates = summary.duplicates
        run.notes = "; ".join(summary.notes)[:2000] if summary.notes else None
        source.robots_ok = robots_ok
        self.session.flush()
