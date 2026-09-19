"""Licensed feed adapter.

The preferred production source. A feed accessed under an agreement has none of the
problems a scraped page has: it is stable, it is documented, it is fast, and nobody has
to argue about whether reading it is permitted.

The adapter is generic on purpose. Point it at any HTTP endpoint that returns JSON
containing a list of fares, describe where the fields are with a small mapping, and it
works. That mapping lives in the environment, not in code, so adding a provider is a
configuration change.

Environment variables:
    FEED_URL_TEMPLATE   e.g. https://provider.example/v1/fares?from={origin}&to={destination}&date={date}
    FEED_API_KEY        sent as the Authorization bearer token when set
    FEED_RESULTS_PATH   dotted path to the list inside the response, e.g. "data.offers"
    FEED_FIELD_MAP      JSON object mapping our field names to theirs
"""

from __future__ import annotations

import datetime as dt
import json
import os
from typing import Any

import httpx

from collector.base import FetchResult, RawRecord, RouteSpec, SourceAdapter

DEFAULT_FIELD_MAP: dict[str, str] = {
    "total_fare": "total_amount",
    "base_fare": "base_amount",
    "taxes": "tax_amount",
    "airline": "carrier_code",
    "flight_no": "flight_number",
    "cabin": "cabin_class",
    "currency": "currency",
    "departure_time": "departure_time",
}


def _dig(payload: Any, dotted_path: str) -> Any:
    """Walk a dotted path, returning None instead of raising on a missing key."""
    current = payload
    if not dotted_path:
        return current
    for part in dotted_path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list) and part.isdigit():
            index = int(part)
            current = current[index] if index < len(current) else None
        else:
            return None
        if current is None:
            return None
    return current


class LicensedFeedAdapter(SourceAdapter):
    code = "feed"
    name = "Licensed fare feed"
    kind = "feed"
    #: A feed is accessed under an agreement, not by reading a public page, so the
    #: robots gate does not apply. The agreement is the permission.
    requires_robots_check = False

    def __init__(self, timeout: float = 20.0) -> None:
        self.url_template = os.getenv("FEED_URL_TEMPLATE", "")
        self.api_key = os.getenv("FEED_API_KEY", "")
        self.results_path = os.getenv("FEED_RESULTS_PATH", "")
        raw_map = os.getenv("FEED_FIELD_MAP", "")
        self.field_map = {**DEFAULT_FIELD_MAP}
        if raw_map:
            try:
                self.field_map.update(json.loads(raw_map))
            except json.JSONDecodeError as exc:
                raise ValueError(f"FEED_FIELD_MAP is not valid JSON: {exc}") from exc
        self.timeout = timeout
        self.base_url = self.url_template.split("?")[0] or None

    @property
    def configured(self) -> bool:
        return bool(self.url_template)

    def fetch(
        self, route: RouteSpec, departure_date: dt.date, captured_at: dt.datetime
    ) -> FetchResult:
        if not self.configured:
            return FetchResult(
                records=[], ok=False, requests_made=0,
                error="FEED_URL_TEMPLATE is not set; the licensed feed adapter is idle",
            )

        url = self.url_template.format(
            origin=route.origin,
            destination=route.destination,
            date=departure_date.isoformat(),
        )
        headers = {"Accept": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        try:
            response = httpx.get(url, headers=headers, timeout=self.timeout)
            response.raise_for_status()
            body = response.json()
        except httpx.HTTPError as exc:
            return FetchResult(records=[], ok=False, error=f"{type(exc).__name__}: {exc}")
        except json.JSONDecodeError as exc:
            return FetchResult(records=[], ok=False, error=f"feed returned non-JSON: {exc}")

        return FetchResult(records=self.parse(body, route, departure_date, captured_at), ok=True)

    def parse(
        self,
        payload: Any,
        route: RouteSpec,
        departure_date: dt.date,
        captured_at: dt.datetime,
    ) -> list[RawRecord]:
        rows = _dig(payload, self.results_path) if self.results_path else payload
        if not isinstance(rows, list):
            return []

        records: list[RawRecord] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            mapped = {
                ours: _dig(row, theirs) for ours, theirs in self.field_map.items()
            }
            if mapped.get("total_fare") is None or mapped.get("airline") is None:
                continue
            mapped.setdefault("currency", "INR")
            records.append(
                RawRecord(
                    route_code=route.code,
                    departure_date=departure_date,
                    captured_at=captured_at,
                    airline_code=str(mapped["airline"]),
                    payload={k: v for k, v in mapped.items() if v is not None},
                    flight_no=(str(mapped["flight_no"]) if mapped.get("flight_no") else None),
                    cabin=str(mapped.get("cabin") or "economy"),
                    currency=str(mapped.get("currency") or "INR"),
                    source_code=self.code,
                )
            )
        return records
