"""Live portal adapters.

Read this before enabling anything in this file.

These adapters drive a headless browser against public fare pages. They are switched off
by default and stay off unless three separate conditions are met:

  1. `COLLECTOR_LIVE_ADAPTERS_ENABLED=true` in the environment.
  2. The source is named in `COLLECTOR_ENABLED_SOURCES`.
  3. The robots gate allows the specific URL, checked on every run, failing closed.

They also require the optional dependencies (`pip install -r requirements-scrapers.txt`
then `playwright install chromium`). Without those, constructing one raises immediately
rather than degrading into something that half works.

An honest statement of where these stand: the page structures of Indian airline and
aggregator portals are not stable, are not documented, and in several cases the Terms of
Service prohibit automated extraction outright. The selectors below are placeholders.
Completing them is a per-portal engineering task that must be preceded by a Terms of
Service review recorded in docs/compliance.md, and for several of the named portals the
correct outcome of that review is not to collect at all.

This file is therefore structure, not a working scraper, and the project does not claim
otherwise. The pipeline it feeds is fully exercised by the synthetic and feed adapters.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Any

from collector.base import FetchResult, RawRecord, RouteSpec, SourceAdapter


@dataclass(frozen=True)
class PortalSelectors:
    """Where the fares live on a page.

    Kept as data rather than code so that a layout change is a configuration edit and a
    contract test can assert against a recorded fixture without a browser.
    """

    result_row: str
    price: str
    airline: str
    flight_number: str | None = None
    departure_time: str | None = None
    no_results_marker: str | None = None


class PlaywrightPortalAdapter(SourceAdapter):
    """Shared machinery for portal adapters: browser lifecycle, search, extraction.

    Subclasses supply a URL template and selectors. None of them get to decide whether
    they are allowed to run; the runner decides that before calling `fetch`.
    """

    kind = "ota"
    requires_robots_check = True
    url_template: str = ""
    selectors: PortalSelectors | None = None
    page_timeout_ms: int = 30000

    def __init__(self, headless: bool = True) -> None:
        self.headless = headless
        self._playwright: Any = None
        self._browser: Any = None

    def prepare(self) -> None:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise RuntimeError(
                f"Adapter {self.code!r} needs Playwright. Install the optional scraper "
                "dependencies: pip install -r requirements-scrapers.txt && "
                "playwright install chromium"
            ) from exc
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(headless=self.headless)

    def teardown(self) -> None:
        if self._browser is not None:
            self._browser.close()
            self._browser = None
        if self._playwright is not None:
            self._playwright.stop()
            self._playwright = None

    def build_url(self, route: RouteSpec, departure_date: dt.date) -> str:
        if not self.url_template:
            raise NotImplementedError(f"{type(self).__name__} has no url_template")
        return self.url_template.format(
            origin=route.origin,
            destination=route.destination,
            date=departure_date.isoformat(),
            date_ddmmyyyy=departure_date.strftime("%d%m%Y"),
        )

    def fetch(
        self, route: RouteSpec, departure_date: dt.date, captured_at: dt.datetime
    ) -> FetchResult:
        if self._browser is None:
            return FetchResult(
                records=[], ok=False, error="browser not started; prepare() was not called",
                requests_made=0,
            )
        if self.selectors is None:
            return FetchResult(
                records=[], ok=False, requests_made=0,
                error=(
                    f"{self.code}: selectors are not defined. This adapter is a "
                    "placeholder pending a Terms of Service review and per-portal "
                    "selector work."
                ),
            )

        url = self.build_url(route, departure_date)
        context = self._browser.new_context(user_agent=self.user_agent())
        page = context.new_page()
        try:
            page.goto(url, timeout=self.page_timeout_ms, wait_until="domcontentloaded")
            page.wait_for_selector(self.selectors.result_row, timeout=self.page_timeout_ms)
            rows = page.query_selector_all(self.selectors.result_row)
            payloads = [self._extract_row(row) for row in rows]
        except Exception as exc:  # noqa: BLE001 - a failed page is data, not a crash
            return FetchResult(records=[], ok=False, error=f"{type(exc).__name__}: {exc}")
        finally:
            page.close()
            context.close()

        records = self.parse(payloads, route, departure_date, captured_at)
        return FetchResult(records=records, ok=True)

    def _extract_row(self, row: Any) -> dict[str, Any]:
        assert self.selectors is not None
        selectors = self.selectors

        def text(selector: str | None) -> str | None:
            if not selector:
                return None
            element = row.query_selector(selector)
            return element.inner_text().strip() if element else None

        return {
            "price": text(selectors.price),
            "airline": text(selectors.airline),
            "flight_no": text(selectors.flight_number),
            "departure_time": text(selectors.departure_time),
        }

    def parse(
        self,
        payload: Any,
        route: RouteSpec,
        departure_date: dt.date,
        captured_at: dt.datetime,
    ) -> list[RawRecord]:
        """Turn extracted row dictionaries into records.

        Pure and browser-free, so each adapter's contract test can run it against a
        recorded fixture. That test is what catches a portal layout change: the fixture
        stops producing records and the test fails loudly, instead of the index quietly
        losing a source.
        """
        records: list[RawRecord] = []
        for row in payload or []:
            if not row.get("price") or not row.get("airline"):
                continue
            records.append(
                RawRecord(
                    route_code=route.code,
                    departure_date=departure_date,
                    captured_at=captured_at,
                    airline_code=str(row["airline"]),
                    payload={
                        "total_fare": row.get("price"),
                        "airline": row.get("airline"),
                        "departure_time": row.get("departure_time"),
                        "currency": "INR",
                        "cabin": "economy",
                        "source_url_host": self.base_url,
                    },
                    flight_no=row.get("flight_no"),
                    source_code=self.code,
                )
            )
        return records

    def user_agent(self) -> str:
        from app.core.config import get_settings

        return get_settings().collector_user_agent


class IndiGoAdapter(PlaywrightPortalAdapter):
    code = "indigo"
    name = "IndiGo"
    kind = "airline"
    base_url = "https://www.goindigo.in"
    tos_url = "https://www.goindigo.in/information/terms-and-conditions.html"
    url_template = (
        "https://www.goindigo.in/booking/search-results"
        "?origin={origin}&destination={destination}&departure={date}&adults=1"
    )
    selectors = None  # pending Terms of Service review, see module docstring


class AirIndiaAdapter(PlaywrightPortalAdapter):
    code = "airindia"
    name = "Air India"
    kind = "airline"
    base_url = "https://www.airindia.com"
    tos_url = "https://www.airindia.com/in/en/legal/terms-conditions.html"
    url_template = (
        "https://www.airindia.com/in/en/booking/flight-search"
        "?from={origin}&to={destination}&depart={date}&adults=1"
    )
    selectors = None


class MakeMyTripAdapter(PlaywrightPortalAdapter):
    code = "makemytrip"
    name = "MakeMyTrip"
    kind = "ota"
    base_url = "https://www.makemytrip.com"
    tos_url = "https://www.makemytrip.com/legal/in/user_agreement.html"
    url_template = (
        "https://www.makemytrip.com/flight/search"
        "?itinerary={origin}-{destination}-{date}&tripType=O&paxType=A-1"
    )
    selectors = None


LIVE_ADAPTERS: dict[str, type[PlaywrightPortalAdapter]] = {
    IndiGoAdapter.code: IndiGoAdapter,
    AirIndiaAdapter.code: AirIndiaAdapter,
    MakeMyTripAdapter.code: MakeMyTripAdapter,
}
