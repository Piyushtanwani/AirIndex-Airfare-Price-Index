"""The adapter contract.

Every source, whether it is a synthetic generator, a licensed feed or a live portal,
implements this one interface. The runner knows nothing else about them. That is what
makes the compliance posture enforceable: the gate lives in the runner, so no adapter can
skip it by being written differently.
"""

from __future__ import annotations

import abc
import datetime as dt
import hashlib
import json
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class RouteSpec:
    """What the runner hands an adapter. A plain value, not a database row, so adapters
    cannot reach into the database."""

    code: str
    origin: str
    destination: str
    origin_city: str = ""
    dest_city: str = ""
    distance_km: int | None = None
    airlines: tuple[str, ...] = ()
    base_fare_inr: float = 5000.0
    volatility: float = 0.15


@dataclass
class RawRecord:
    """One fare as the source gave it, plus the provenance needed to trust it later."""

    route_code: str
    departure_date: dt.date
    captured_at: dt.datetime
    airline_code: str
    payload: dict[str, Any]
    flight_no: str | None = None
    cabin: str = "economy"
    currency: str = "INR"
    source_code: str = "unknown"

    def fingerprint(self) -> str:
        """Stable identity for deduplication.

        Deliberately excludes the capture timestamp and includes the price. Two fetches
        of the same page minutes apart that return the same fare are the same
        observation and must collapse. The same flight at a different price is a new
        observation, because that movement is exactly what the index measures.
        """
        material = {
            "source": self.source_code,
            "route": self.route_code,
            "departure": self.departure_date.isoformat(),
            "airline": self.airline_code,
            "flight": self.flight_no or "",
            "cabin": self.cabin,
            "observation_date": self.captured_at.date().isoformat(),
            "total": self.payload.get("total_fare") or self.payload.get("price"),
        }
        encoded = json.dumps(material, sort_keys=True, default=str).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()


@dataclass
class FetchResult:
    """What one fetch produced, including its failures.

    A failed fetch returns a result with `ok` false rather than raising. The runner
    counts it, records it on the crawl run and moves on. One unreachable route must not
    end a collection cycle.
    """

    records: list[RawRecord] = field(default_factory=list)
    ok: bool = True
    error: str | None = None
    requests_made: int = 1


class SourceAdapter(abc.ABC):
    """Base class for every source.

    Subclasses set the class attributes and implement `fetch`. `parse` is separate so it
    can be unit-tested against a recorded fixture without any network access, which is
    how an adapter's contract test detects a portal layout change.
    """

    code: str = "abstract"
    name: str = "Abstract source"
    kind: str = "feed"  # airline | ota | feed | synthetic
    base_url: str | None = None
    tos_url: str | None = None
    #: Live network sources are gated. Set False only for generators and licensed feeds
    #: that are accessed under an agreement rather than by reading a public page.
    requires_robots_check: bool = True

    def prepare(self) -> None:
        """Optional one-off setup, for example starting a browser."""

    def teardown(self) -> None:
        """Optional cleanup. Always called, even when the run failed."""

    @abc.abstractmethod
    def fetch(self, route: RouteSpec, departure_date: dt.date, captured_at: dt.datetime) -> FetchResult:
        """Return the fares this source shows for one route and one departure date."""

    def parse(self, payload: Any, route: RouteSpec, departure_date: dt.date,
              captured_at: dt.datetime) -> list[RawRecord]:
        """Turn a source-shaped response into records. Overridden by live adapters."""
        raise NotImplementedError

    def describe(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "name": self.name,
            "kind": self.kind,
            "base_url": self.base_url,
            "tos_url": self.tos_url,
            "requires_robots_check": self.requires_robots_check,
        }
