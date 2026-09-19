"""Policy scenario simulation.

A user sets a shock, the simulator reports what the airfare index and the airfare
contribution to the Consumer Price Index would look like under it.

What this is: an arithmetic model, transparent end to end, whose every coefficient sits
in config/policy.yaml and is returned with every result.

What this is not: a structural or econometric model of Indian aviation. None of the
coefficients are estimated from AirIndex data, because estimating them needs fuel prices,
capacity data and a published CPI airfare series that this project does not have. They
are stated priors from the literature.

The distinction matters more here than anywhere else in the project. An index computed
from observed prices is a measurement with known limitations. A scenario is a calculation
whose output is entirely determined by assumptions the user cannot see unless they are
shown. So they are shown, with every result, without being asked for.

Two guards are built in. Shocks outside the configured bounds are refused rather than
extrapolated. And the Consumer Price Index effect is reported as illustrative, not as a
CPI impact, until the official airfare weight replaces the placeholder in configuration.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

import numpy as np


@dataclass
class ScenarioInput:
    airfare_shock_pct: float = 0.0
    atf_shock_pct: float = 0.0
    demand_shock_pct: float = 0.0
    capacity_shock_pct: float = 0.0
    horizon_days: int = 90


@dataclass
class ScenarioPoint:
    date: dt.date
    baseline: float
    scenario: float
    delta_pct: float


@dataclass
class ScenarioResult:
    inputs: dict[str, float]
    assumptions: dict[str, object]
    channels: list[dict[str, object]] = field(default_factory=list)
    total_fare_effect_pct: float = 0.0
    cpi_effect_pp: float | None = None
    cpi_effect_is_official: bool = False
    path: list[ScenarioPoint] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        return {
            "inputs": self.inputs,
            "assumptions": self.assumptions,
            "channels": self.channels,
            "total_fare_effect_pct": round(self.total_fare_effect_pct, 4),
            "cpi_effect_pp": (
                None if self.cpi_effect_pp is None else round(self.cpi_effect_pp, 5)
            ),
            "cpi_effect_is_official": self.cpi_effect_is_official,
            "path": [
                {
                    "date": p.date.isoformat(),
                    "baseline": round(p.baseline, 4),
                    "scenario": round(p.scenario, 4),
                    "delta_pct": round(p.delta_pct, 4),
                }
                for p in self.path
            ],
            "notes": self.notes,
            "warnings": self.warnings,
        }


class ScenarioError(ValueError):
    """A scenario the simulator refuses to answer."""


def _check_bounds(inputs: ScenarioInput, bounds: dict[str, float]) -> None:
    checks = [
        ("airfare", inputs.airfare_shock_pct, bounds.get("max_airfare_shock_pct", 50.0)),
        ("ATF fuel", inputs.atf_shock_pct, bounds.get("max_atf_shock_pct", 60.0)),
        ("demand", inputs.demand_shock_pct, bounds.get("max_demand_shock_pct", 40.0)),
        ("capacity", inputs.capacity_shock_pct, bounds.get("max_capacity_shock_pct", 30.0)),
    ]
    for name, value, limit in checks:
        if abs(value) > limit:
            raise ScenarioError(
                f"The {name} shock of {value:+.1f}% is outside the supported range of "
                f"plus or minus {limit:.0f}%. The coefficients in config/policy.yaml are "
                "stated priors calibrated for moderate movements, and extrapolating them "
                "to a shock this large would produce a number with no support behind it."
            )
    max_horizon = int(bounds.get("max_horizon_days", 180))
    if not 1 <= inputs.horizon_days <= max_horizon:
        raise ScenarioError(f"Horizon must be between 1 and {max_horizon} days.")


def simulate(
    inputs: ScenarioInput,
    policy: dict,
    *,
    baseline_index: float,
    baseline_date: dt.date,
) -> ScenarioResult:
    """Run one scenario.

    The four channels are additive in percentage terms, which is an approximation that
    holds for the moderate shocks the bounds permit and breaks for large ones. That is
    part of why the bounds exist.
    """
    bounds = policy.get("bounds", {}) or {}
    _check_bounds(inputs, bounds)

    fuel = policy.get("fuel", {}) or {}
    demand_cfg = policy.get("demand", {}) or {}
    capacity_cfg = policy.get("capacity", {}) or {}
    cpi_cfg = policy.get("cpi", {}) or {}

    atf_share = float(fuel.get("atf_cost_share", 0.38))
    pass_through = float(fuel.get("pass_through", 0.55))
    lag_days = int(fuel.get("pass_through_lag_days", 45))
    demand_to_fare = float(demand_cfg.get("demand_to_fare", 0.45))
    capacity_to_fare = float(capacity_cfg.get("capacity_to_fare", -0.60))

    channels: list[dict[str, object]] = []

    direct = inputs.airfare_shock_pct
    if direct:
        channels.append({
            "channel": "direct airfare shock",
            "input_pct": round(direct, 4),
            "effect_pct": round(direct, 4),
            "mechanism": "Applied to the index directly, with no intermediate assumption.",
        })

    fuel_effect = inputs.atf_shock_pct * atf_share * pass_through
    if inputs.atf_shock_pct:
        channels.append({
            "channel": "ATF fuel pass-through",
            "input_pct": round(inputs.atf_shock_pct, 4),
            "effect_pct": round(fuel_effect, 4),
            "mechanism": (
                f"A {inputs.atf_shock_pct:+.1f}% fuel move applies to the "
                f"{atf_share:.0%} of operating cost that fuel represents, of which "
                f"{pass_through:.0%} reaches the fare over {lag_days} days."
            ),
        })

    demand_effect = inputs.demand_shock_pct * demand_to_fare
    if inputs.demand_shock_pct:
        channels.append({
            "channel": "demand shift",
            "input_pct": round(inputs.demand_shock_pct, 4),
            "effect_pct": round(demand_effect, 4),
            "mechanism": (
                f"With the schedule fixed in the short run, a {inputs.demand_shock_pct:+.1f}% "
                f"demand move passes to fares at a ratio of {demand_to_fare:.2f}."
            ),
        })

    capacity_effect = inputs.capacity_shock_pct * capacity_to_fare
    if inputs.capacity_shock_pct:
        channels.append({
            "channel": "capacity change",
            "input_pct": round(inputs.capacity_shock_pct, 4),
            "effect_pct": round(capacity_effect, 4),
            "mechanism": (
                f"A {inputs.capacity_shock_pct:+.1f}% change in seats offered moves fares "
                f"by {capacity_to_fare:.2f} times that, in the opposite direction."
            ),
        })

    total = direct + fuel_effect + demand_effect + capacity_effect

    # Path. The direct, demand and capacity channels are treated as immediate; the fuel
    # channel ramps in linearly over its stated lag, which is the only dynamic in the
    # model and is labelled as a simplification.
    immediate = direct + demand_effect + capacity_effect
    path: list[ScenarioPoint] = []
    for day in range(inputs.horizon_days + 1):
        ramp = min(1.0, day / lag_days) if lag_days > 0 else 1.0
        effect = immediate + fuel_effect * ramp
        scenario_value = baseline_index * (1 + effect / 100.0)
        path.append(
            ScenarioPoint(
                date=baseline_date + dt.timedelta(days=day),
                baseline=baseline_index,
                scenario=scenario_value,
                delta_pct=effect,
            )
        )

    cpi_weight = float(cpi_cfg.get("airfare_weight_pct", 0.0))
    cpi_official = bool(cpi_cfg.get("weight_is_official", False))
    cpi_effect = total * cpi_weight / 100.0 if cpi_weight else None

    notes = [
        "Channels are added in percentage terms. That approximation holds for moderate "
        "shocks and is one reason the simulator refuses large ones.",
        "Only the fuel channel has a time path. The others are applied immediately, "
        "which overstates how quickly demand and capacity reach fares.",
        f"Every coefficient used here is listed under assumptions and comes from "
        f"config/policy.yaml. None is estimated from AirIndex data.",
    ]
    warnings: list[str] = []

    if cpi_effect is not None:
        if cpi_official:
            notes.append(
                f"With an airfare weight of {cpi_weight:.3f}% of the CPI basket, the "
                f"total fare effect of {total:+.2f}% maps to {cpi_effect:+.4f} "
                "percentage points of headline CPI."
            )
        else:
            warnings.append(
                "The CPI airfare weight in configuration is a placeholder, not the "
                "official MoSPI figure. The percentage point number below is "
                "illustrative arithmetic and must not be quoted as a CPI impact until "
                "the official weight replaces it."
            )
    else:
        warnings.append("No CPI airfare weight is configured, so no CPI effect is reported.")

    if abs(total) > 25:
        warnings.append(
            f"A total fare effect of {total:+.1f}% is very large. Check the inputs before "
            "reading anything into the result."
        )

    return ScenarioResult(
        inputs={
            "airfare_shock_pct": inputs.airfare_shock_pct,
            "atf_shock_pct": inputs.atf_shock_pct,
            "demand_shock_pct": inputs.demand_shock_pct,
            "capacity_shock_pct": inputs.capacity_shock_pct,
            "horizon_days": float(inputs.horizon_days),
        },
        assumptions={
            "atf_cost_share": atf_share,
            "atf_pass_through": pass_through,
            "atf_pass_through_lag_days": lag_days,
            "demand_to_fare": demand_to_fare,
            "capacity_to_fare": capacity_to_fare,
            "cpi_airfare_weight_pct": cpi_weight,
            "cpi_weight_is_official": cpi_official,
            "source_file": "backend/config/policy.yaml",
            "all_values_are_stated_priors": True,
        },
        channels=channels,
        total_fare_effect_pct=total,
        cpi_effect_pp=cpi_effect,
        cpi_effect_is_official=cpi_official,
        path=path,
        notes=notes,
        warnings=warnings,
    )


def sensitivity(
    inputs: ScenarioInput, policy: dict, *, baseline_index: float, baseline_date: dt.date
) -> list[dict[str, object]]:
    """How much the answer depends on each assumption.

    Each coefficient is moved by plus and minus a quarter of its value and the scenario
    rerun. A result that swings widely under this is a result driven by a prior rather
    than by the shock the user asked about, and the reader should be able to see that at
    a glance.
    """
    import copy

    baseline_result = simulate(
        inputs, policy, baseline_index=baseline_index, baseline_date=baseline_date
    )
    base_total = baseline_result.total_fare_effect_pct

    targets = [
        ("fuel", "atf_cost_share"),
        ("fuel", "pass_through"),
        ("demand", "demand_to_fare"),
        ("capacity", "capacity_to_fare"),
    ]

    rows: list[dict[str, object]] = []
    for section, key in targets:
        original = float((policy.get(section) or {}).get(key, 0.0))
        if original == 0:
            continue
        swings = []
        for factor in (0.75, 1.25):
            variant = copy.deepcopy(policy)
            variant[section][key] = original * factor
            result = simulate(
                inputs, variant, baseline_index=baseline_index, baseline_date=baseline_date
            )
            swings.append(result.total_fare_effect_pct)
        rows.append({
            "assumption": f"{section}.{key}",
            "baseline_value": original,
            "low_value": round(original * 0.75, 4),
            "high_value": round(original * 1.25, 4),
            "effect_low_pct": round(min(swings), 4),
            "effect_high_pct": round(max(swings), 4),
            "swing_pct_points": round(abs(max(swings) - min(swings)), 4),
            "share_of_result": (
                round(abs(max(swings) - min(swings)) / abs(base_total), 4)
                if base_total
                else None
            ),
        })

    return sorted(rows, key=lambda r: float(r["swing_pct_points"]), reverse=True)


def detect_series_anomalies(
    dates: list[dt.date], values: list[float], *, z_threshold: float = 3.0
) -> list[dict[str, object]]:
    """Unusual day-on-day movements in the published series.

    Scored on the distribution of daily log changes, using the median absolute deviation
    rather than the standard deviation, so a single large jump does not inflate the
    threshold that would have caught it.
    """
    if len(values) < 10:
        return []

    array = np.asarray(values, dtype=float)
    changes = np.diff(np.log(np.clip(array, 1e-9, None)))
    median = float(np.median(changes))
    deviations = np.abs(changes - median)
    mad = float(np.median(deviations))
    if mad == 0:
        return []

    scores = 0.6745 * (changes - median) / mad
    anomalies = []
    for i, score in enumerate(scores):
        if abs(score) < z_threshold:
            continue
        anomalies.append({
            "date": dates[i + 1].isoformat(),
            "value": round(float(array[i + 1]), 4),
            "previous": round(float(array[i]), 4),
            "change_pct": round(float((array[i + 1] / array[i] - 1) * 100), 4),
            "z_score": round(float(score), 3),
            "direction": "rise" if score > 0 else "fall",
            "severity": "high" if abs(score) > z_threshold * 1.6 else "moderate",
        })
    return anomalies
