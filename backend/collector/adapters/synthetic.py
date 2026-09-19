"""The synthetic source.

This exists because the demonstration must not depend on conduct the team cannot defend.
The airline and aggregator portals named in the proposal prohibit automated fare
extraction in their terms and block it in practice, so a pipeline that only works when
those portals cooperate is a pipeline that does not work.

What this generator is: a fare process with the structure real fares have, so every
downstream component, the quality rules, the outlier detection, the index, the coverage
threshold and the back-test, is exercised for real.

What it is not: real market prices. Every value it produces is labelled synthetic in the
database, in the API and on the dashboard, and the index computed from it is a
demonstration of the method, not a measurement of Indian airfares.

The process below is deterministic given the seed, so a back-test is reproducible.
"""

from __future__ import annotations

import datetime as dt
import functools
import hashlib
import math

import numpy as np

from collector.base import FetchResult, RawRecord, RouteSpec, SourceAdapter

EPOCH = dt.date(2026, 1, 1)

AIRLINE_POSITIONING: dict[str, float] = {
    "6E": 1.00,   # the volume carrier, the reference point
    "AI": 1.09,   # full service, prices above the low-cost carriers
    "QP": 0.97,   # newer entrant buying share
    "SG": 0.95,
    "UK": 1.12,
}

DEPARTURE_SLOTS: tuple[tuple[str, float], ...] = (
    ("06:15", 0.94),  # early morning, cheap
    ("09:40", 1.06),  # business peak
    ("14:20", 0.92),  # midday trough
    ("18:50", 1.08),  # evening peak
    ("21:35", 0.90),  # late night
)


def _rng(*parts: object) -> np.random.Generator:
    """A generator keyed by its inputs, so the same cell always yields the same fare."""
    material = "|".join(str(p) for p in parts).encode("utf-8")
    digest = hashlib.sha256(material).digest()
    return np.random.default_rng(int.from_bytes(digest[:8], "big"))


def lead_time_factor(lead_days: int) -> float:
    """The booking curve.

    Fares fall as the departure moves away and rise steeply in the last week. The shape
    is an exponential decay towards an advance-purchase floor, which is the shape the
    published Indian booking-curve studies describe.
    """
    return 0.78 + 0.62 * math.exp(-lead_days / 11.0)


def day_of_week_factor(departure: dt.date) -> float:
    """Friday and Sunday departures price above midweek."""
    return (1.02, 0.97, 0.96, 0.99, 1.09, 0.98, 1.07)[departure.weekday()]


def seasonal_factor(departure: dt.date) -> float:
    """A yearly cycle, peaking around the winter holiday season."""
    day_of_year = departure.timetuple().tm_yday
    return 1.0 + 0.085 * math.sin(2 * math.pi * (day_of_year - 300) / 365.0)


@functools.lru_cache(maxsize=4096)
def market_level(observation_date: dt.date, seed: int) -> float:
    """Market-wide drift over collection time.

    This is the signal the index is supposed to find: a slow common movement in the
    level of fares, independent of which route or departure date is being priced. It is
    built as a deterministic random walk with mild mean reversion so the series neither
    wanders off nor sits flat.
    """
    days = (observation_date - EPOCH).days
    if days < 0:
        days = 0
    level = 0.0
    generator = _rng("market", seed)
    increments = generator.normal(0.0, 0.0038, size=max(days, 1) + 1)
    for i in range(days + 1):
        level = 0.985 * level + float(increments[i])
    # A gentle upward trend on top of the walk, roughly four per cent a year.
    trend = 0.04 * days / 365.0
    return float(math.exp(level + trend))


@functools.lru_cache(maxsize=8192)
def route_level(route_code: str, observation_date: dt.date, seed: int) -> float:
    """Route-specific drift, so the routes do not all move together."""
    days = (observation_date - EPOCH).days
    generator = _rng("route-level", route_code, seed)
    phase = float(generator.uniform(0, 2 * math.pi))
    amplitude = float(generator.uniform(0.02, 0.06))
    period = float(generator.uniform(24, 70))
    return 1.0 + amplitude * math.sin(2 * math.pi * days / period + phase)


class SyntheticSource(SourceAdapter):
    """A calibrated fare generator. No network access, no compliance surface."""

    code = "synthetic"
    name = "Synthetic calibrated generator"
    kind = "synthetic"
    base_url = None
    tos_url = None
    requires_robots_check = False

    def __init__(
        self,
        seed: int = 26056,
        sold_out_probability: float = 0.035,
        promo_probability: float = 0.02,
        glitch_probability: float = 0.006,
    ) -> None:
        self.seed = seed
        self.sold_out_probability = sold_out_probability
        self.promo_probability = promo_probability
        # Occasional implausible values, so the validation and outlier rules have
        # something real to catch. A pipeline only tested on clean data is untested.
        self.glitch_probability = glitch_probability

    def fetch(
        self, route: RouteSpec, departure_date: dt.date, captured_at: dt.datetime
    ) -> FetchResult:
        observation_date = captured_at.date()
        lead_days = (departure_date - observation_date).days
        if lead_days < 0:
            return FetchResult(records=[], ok=True, requests_made=0)

        airlines = route.airlines or ("6E", "AI")
        level = market_level(observation_date, self.seed) * route_level(
            route.code, observation_date, self.seed
        )
        shape = (
            lead_time_factor(lead_days)
            * day_of_week_factor(departure_date)
            * seasonal_factor(departure_date)
        )

        records: list[RawRecord] = []
        for airline in airlines:
            positioning = AIRLINE_POSITIONING.get(airline, 1.0)
            for slot_time, slot_factor in DEPARTURE_SLOTS:
                generator = _rng(
                    self.seed, route.code, departure_date, observation_date, airline, slot_time
                )
                if generator.random() < self.sold_out_probability:
                    continue  # sold out: the portal shows no fare at all

                noise = float(generator.lognormal(0.0, route.volatility * 0.45))
                price = route.base_fare_inr * level * shape * positioning * slot_factor * noise

                if generator.random() < self.promo_probability:
                    price *= float(generator.uniform(0.62, 0.78))

                payload = self._build_payload(price, route, airline, slot_time, generator)
                records.append(
                    RawRecord(
                        route_code=route.code,
                        departure_date=departure_date,
                        captured_at=captured_at,
                        airline_code=airline,
                        payload=payload,
                        flight_no=f"{airline}-{int(generator.integers(100, 9999))}",
                        cabin="economy",
                        currency=payload["currency"],
                        source_code=self.code,
                    )
                )

        return FetchResult(records=records, ok=True, requests_made=1)

    def _build_payload(
        self,
        price: float,
        route: RouteSpec,
        airline: str,
        slot_time: str,
        generator: np.random.Generator,
    ) -> dict[str, object]:
        """Itemise the fare the way a portal does, then occasionally corrupt it."""
        base = round(price, 0)
        udf = 150.0 if (route.distance_km or 0) < 1200 else 236.0
        taxes = round(base * 0.056 + 195.0, 0)
        convenience = 0.0
        total = base + taxes + udf + convenience
        currency = "INR"

        roll = generator.random()
        if roll < self.glitch_probability:
            # A layout change that puts a booking-fee placeholder in the price field.
            total = 0.0
            base = 0.0
            taxes = 0.0
            udf = 0.0
        elif roll < self.glitch_probability * 2:
            # A currency mix-up, which the validator must reject rather than index.
            currency = "USD"
        elif roll < self.glitch_probability * 3:
            # A fat-fingered fare an order of magnitude out, for the outlier rule.
            base *= 11.0
            total = base + taxes + udf

        return {
            "total_fare": round(total, 2),
            "base_fare": round(base, 2),
            "taxes": round(taxes, 2),
            "udf": round(udf, 2),
            "convenience_fee": round(convenience, 2),
            "currency": currency,
            "airline": airline,
            "cabin": "economy",
            "departure_time": slot_time,
            "origin": route.origin,
            "destination": route.destination,
            "is_synthetic": True,
        }
