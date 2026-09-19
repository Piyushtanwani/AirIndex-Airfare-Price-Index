"""Turn raw source payloads into comparable fares.

Sources disagree about almost everything: what a "price" includes, what an airline is
called, whether a tax is itemised. Nothing downstream of this module is allowed to know
that. It takes whatever the adapter produced and emits one schema.

Every function here is pure. It takes data and returns data, touches no database and
reads no clock, so the rules can be tested exactly.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any

# Airline naming varies by portal. The index needs one code per carrier.
AIRLINE_ALIASES: dict[str, str] = {
    "6e": "6E", "indigo": "6E", "interglobe": "6E",
    "ai": "AI", "air india": "AI", "airindia": "AI", "ix": "AI", "air india express": "AI",
    "qp": "QP", "akasa": "QP", "akasa air": "QP", "snv": "QP",
    "sg": "SG", "spicejet": "SG", "spice jet": "SG",
    "uk": "UK", "vistara": "UK",
}

CABIN_ALIASES: dict[str, str] = {
    "economy": "economy", "eco": "economy", "y": "economy", "saver": "economy",
    "economy saver": "economy", "value": "economy", "flexi": "economy",
    "premium economy": "premium_economy", "pe": "premium_economy", "w": "premium_economy",
    "business": "business", "j": "business", "c": "business",
    "first": "first", "f": "first",
}

# Typical share of the total when a source reports only a single all-inclusive price and
# no component split. Used only to populate the component columns for display; the index
# itself prices the total, so an imperfect split cannot move the published number.
ASSUMED_TAX_SHARE = 0.16
ASSUMED_UDF_SHARE = 0.03


@dataclass
class NormalisedFare:
    """One comparable fare. The shape every adapter must ultimately produce."""

    route_code: str
    departure_date: dt.date
    captured_at: dt.datetime
    airline_code: str
    base_fare: float
    taxes: float
    udf: float
    convenience_fee: float
    total_fare: float
    currency: str = "INR"
    cabin: str = "economy"
    flight_no: str | None = None
    source_code: str = "unknown"
    components_were_split: bool = True
    quality_flags: list[str] = field(default_factory=list)

    @property
    def observation_date(self) -> dt.date:
        return self.captured_at.date()

    @property
    def lead_time_days(self) -> int:
        return (self.departure_date - self.observation_date).days


def normalise_airline(value: Any) -> str | None:
    """Map whatever a portal called the carrier onto an IATA code."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    lowered = text.lower()
    if lowered in AIRLINE_ALIASES:
        return AIRLINE_ALIASES[lowered]
    # A bare two-character code that is already uppercase-able.
    if len(text) == 2 and text.isalnum():
        return text.upper()
    # "IndiGo 6E-2034" style strings.
    for alias, code in AIRLINE_ALIASES.items():
        if alias in lowered:
            return code
    return None


def normalise_cabin(value: Any) -> str:
    if value is None:
        return "economy"
    return CABIN_ALIASES.get(str(value).strip().lower(), "economy")


def parse_money(value: Any) -> float | None:
    """Accept 5120, "5120", "₹5,120", "INR 5 120.00" and refuse anything else.

    Returns None rather than raising, because a source returning junk is an expected
    condition that must be counted, not an exception that stops a run.
    """
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    cleaned = []
    for char in text:
        if char.isdigit() or char == ".":
            cleaned.append(char)
        elif char in {",", " ", " ", "₹"}:
            continue
        elif char.isalpha():
            continue
        elif char == "-":
            cleaned.append(char)
    joined = "".join(cleaned)
    if not joined or joined in {"-", "."}:
        return None
    try:
        return float(joined)
    except ValueError:
        return None


def parse_date(value: Any) -> dt.date | None:
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return dt.datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    try:
        return dt.datetime.fromisoformat(text).date()
    except ValueError:
        return None


def split_components(
    total: float,
    base: float | None = None,
    taxes: float | None = None,
    udf: float | None = None,
    convenience: float | None = None,
) -> tuple[float, float, float, float, bool]:
    """Return (base, taxes, udf, convenience, was_really_split).

    When a source itemises the fare the reported components are kept and only reconciled
    against the total. When it reports one number, the components are apportioned and the
    fare is marked as not genuinely split, so the data quality page can report how much
    of the basket is itemised.
    """
    provided = [v for v in (base, taxes, udf, convenience) if v is not None]
    if base is not None and provided:
        taxes_v = taxes or 0.0
        udf_v = udf or 0.0
        conv_v = convenience or 0.0
        stated_total = base + taxes_v + udf_v + conv_v
        # Absorb small reconciliation differences into taxes rather than the base fare.
        drift = total - stated_total
        if abs(drift) > 0.01:
            taxes_v = max(0.0, taxes_v + drift)
        return round(base, 2), round(taxes_v, 2), round(udf_v, 2), round(conv_v, 2), True

    taxes_v = round(total * ASSUMED_TAX_SHARE, 2)
    udf_v = round(total * ASSUMED_UDF_SHARE, 2)
    base_v = round(total - taxes_v - udf_v, 2)
    return base_v, taxes_v, udf_v, 0.0, False


def normalise_observation(
    payload: dict[str, Any],
    route_code: str,
    source_code: str,
    captured_at: dt.datetime | None = None,
) -> NormalisedFare | None:
    """Build one NormalisedFare from an adapter payload, or None if it cannot be trusted.

    Returning None is a normal outcome. A sold-out flight, a fare shown as "call us" and
    a layout change all land here, and all of them are counted as parse failures rather
    than propagated as half-populated rows.
    """
    # Explicit None checks, not truthiness. A fare of zero is a real thing a portal
    # shows when its layout changes, and it must reach the validator to be rejected and
    # counted, rather than disappearing here as if it had never been collected.
    total = None
    for key in ("total_fare", "price", "fare"):
        if payload.get(key) is not None:
            total = parse_money(payload[key])
            if total is not None:
                break
    if total is None:
        return None

    departure = parse_date(payload.get("departure_date") or payload.get("date"))
    if departure is None:
        return None

    airline = normalise_airline(
        payload.get("airline_code") or payload.get("airline") or payload.get("carrier")
    )
    if airline is None:
        return None

    captured = captured_at
    if captured is None:
        raw_captured = payload.get("captured_at")
        if isinstance(raw_captured, dt.datetime):
            captured = raw_captured
        elif raw_captured:
            try:
                captured = dt.datetime.fromisoformat(str(raw_captured))
            except ValueError:
                captured = None
    if captured is None:
        return None
    if captured.tzinfo is not None:
        captured = captured.astimezone(dt.timezone.utc).replace(tzinfo=None)

    base, taxes, udf, conv, was_split = split_components(
        total,
        parse_money(payload.get("base_fare")),
        parse_money(payload.get("taxes")),
        parse_money(payload.get("udf")),
        parse_money(payload.get("convenience_fee")),
    )

    currency = str(payload.get("currency") or "INR").upper()

    return NormalisedFare(
        route_code=route_code,
        departure_date=departure,
        captured_at=captured,
        airline_code=airline,
        base_fare=base,
        taxes=taxes,
        udf=udf,
        convenience_fee=conv,
        total_fare=round(total, 2),
        currency=currency,
        cabin=normalise_cabin(payload.get("cabin") or payload.get("fare_class")),
        flight_no=(str(payload["flight_no"]).strip() if payload.get("flight_no") else None),
        source_code=source_code,
        components_were_split=was_split,
    )
