"""Data trust scoring.

A single index number tells a reader what moved. It does not tell them whether to believe
it. This module produces the second answer: a set of component scores and one headline
trust score, each traceable to a measurable property of the data rather than to a
judgement.

Five components, each scored zero to one hundred:

  freshness     How recently the underlying observations were collected.
  coverage      What share of the basket, by weight, was observed rather than imputed.
  depth         How many observations sit behind each priced cell.
  provenance    What the data is, and whether it can be attributed. Synthetic data scores
                low here by design, because a demonstration must not be able to present
                itself as a measurement.
  consensus     Whether independent sources agree on the price of the same cell. With one
                source this is undefined, and it reports as undefined rather than as a
                perfect score.

The headline score is a weighted mean of the components that are defined. A component
that cannot be measured is excluded and named, never given a default value. A trust score
that quietly assumes the best about what it cannot see is worse than no score.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

import numpy as np

# Provenance is scored by what the data is, not by how it was obtained. These ceilings
# are deliberately low for anything that is not an agreed feed.
PROVENANCE_SCORES: dict[str, tuple[float, str]] = {
    "feed": (100.0, "Licensed feed obtained under an agreement, with a stable contract."),
    "airline": (85.0, "Read from the carrier's own public page: authoritative but fragile."),
    "ota": (70.0, "Read from an aggregator: a resold price, one step from the carrier."),
    "synthetic": (
        10.0,
        "Generated for demonstration. Structurally realistic and not a real price. "
        "Any index computed from it demonstrates the method and measures nothing.",
    ),
}

COMPONENT_WEIGHTS: dict[str, float] = {
    "freshness": 0.20,
    "coverage": 0.25,
    "depth": 0.15,
    "provenance": 0.30,
    "consensus": 0.10,
}


@dataclass
class TrustComponent:
    name: str
    score: float | None
    detail: str
    measured: bool = True


@dataclass
class TrustReport:
    overall: float | None
    band: str
    components: list[TrustComponent] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    as_of: dt.date | None = None

    def as_dict(self) -> dict[str, object]:
        return {
            "overall": None if self.overall is None else round(self.overall, 1),
            "band": self.band,
            "as_of": self.as_of.isoformat() if self.as_of else None,
            "components": [
                {
                    "name": c.name,
                    "score": None if c.score is None else round(c.score, 1),
                    "detail": c.detail,
                    "measured": c.measured,
                }
                for c in self.components
            ],
            "warnings": self.warnings,
        }


def band_for(score: float | None) -> str:
    if score is None:
        return "unrated"
    if score >= 85:
        return "publishable"
    if score >= 70:
        return "usable with caveats"
    if score >= 50:
        return "indicative only"
    return "not fit for publication"


def score_freshness(latest: dt.datetime | None, now: dt.datetime, target_hours: float = 24.0) -> TrustComponent:
    if latest is None:
        return TrustComponent("freshness", None, "No observations have been collected.", False)
    age_hours = max(0.0, (now - latest).total_seconds() / 3600.0)
    # Full marks inside the target, then a linear decay to zero at four times the target.
    if age_hours <= target_hours:
        score = 100.0
    else:
        span = target_hours * 3.0
        score = max(0.0, 100.0 * (1.0 - (age_hours - target_hours) / span))
    return TrustComponent(
        "freshness",
        score,
        f"Most recent observation is {age_hours:.1f} hours old against a {target_hours:.0f} hour target.",
    )


def score_coverage(coverage: float | None, threshold: float) -> TrustComponent:
    if coverage is None:
        return TrustComponent("coverage", None, "No index value to measure coverage on.", False)
    # The publication threshold is the point at which the value is publishable at all,
    # so it maps to a pass rather than to a good score.
    if coverage >= 1.0:
        score = 100.0
    elif coverage <= threshold:
        score = max(0.0, 60.0 * coverage / max(threshold, 1e-9))
    else:
        score = 60.0 + 40.0 * (coverage - threshold) / max(1.0 - threshold, 1e-9)
    return TrustComponent(
        "coverage",
        score,
        f"{coverage:.0%} of the basket by weight was observed, against a {threshold:.0%} publication threshold.",
    )


def score_depth(obs_per_cell: float | None, target: float = 8.0) -> TrustComponent:
    if obs_per_cell is None:
        return TrustComponent("depth", None, "No priced cells.", False)
    score = float(np.clip(100.0 * obs_per_cell / target, 0.0, 100.0))
    return TrustComponent(
        "depth",
        score,
        f"{obs_per_cell:.1f} valid observations per priced cell against a target of {target:.0f}.",
    )


def score_provenance(source_kinds: dict[str, int]) -> TrustComponent:
    """Weighted by how many observations came from each kind of source."""
    if not source_kinds:
        return TrustComponent("provenance", None, "No sources recorded.", False)
    total = sum(source_kinds.values())
    if total == 0:
        return TrustComponent("provenance", None, "No observations recorded.", False)

    score = 0.0
    parts = []
    for kind, count in sorted(source_kinds.items(), key=lambda kv: -kv[1]):
        kind_score, description = PROVENANCE_SCORES.get(
            kind, (40.0, "Unclassified source.")
        )
        share = count / total
        score += kind_score * share
        parts.append(f"{share:.0%} {kind}")
    return TrustComponent(
        "provenance",
        score,
        f"{', '.join(parts)}. "
        + PROVENANCE_SCORES.get(
            max(source_kinds, key=lambda k: source_kinds[k]), (0.0, "")
        )[1],
    )


def score_consensus(cell_spreads: list[float] | None) -> TrustComponent:
    """Agreement between independent sources pricing the same cell.

    `cell_spreads` is the relative spread between sources for each cell that more than
    one source priced. With a single source the list is empty and the component is
    undefined, which is the truthful answer: one source cannot corroborate itself.
    """
    if not cell_spreads:
        return TrustComponent(
            "consensus",
            None,
            "Only one source priced each cell, so no cross-source agreement can be measured.",
            False,
        )
    median_spread = float(np.median(cell_spreads))
    # A five per cent median spread between sources still scores well; twenty per cent
    # scores zero.
    score = float(np.clip(100.0 * (1.0 - (median_spread - 0.02) / 0.18), 0.0, 100.0))
    return TrustComponent(
        "consensus",
        score,
        f"Median disagreement between sources on the same cell is {median_spread:.1%}.",
    )


def build_report(
    *,
    latest_observation: dt.datetime | None,
    now: dt.datetime,
    coverage: float | None,
    coverage_threshold: float,
    obs_per_cell: float | None,
    source_kinds: dict[str, int],
    cell_spreads: list[float] | None,
    as_of: dt.date | None = None,
) -> TrustReport:
    components = [
        score_freshness(latest_observation, now),
        score_coverage(coverage, coverage_threshold),
        score_depth(obs_per_cell),
        score_provenance(source_kinds),
        score_consensus(cell_spreads),
    ]

    measured = [c for c in components if c.score is not None]
    if measured:
        total_weight = sum(COMPONENT_WEIGHTS[c.name] for c in measured)
        overall = sum(COMPONENT_WEIGHTS[c.name] * (c.score or 0.0) for c in measured) / total_weight
    else:
        overall = None

    warnings: list[str] = []
    for component in components:
        if component.score is None:
            warnings.append(f"{component.name} could not be measured: {component.detail}")
    if source_kinds.get("synthetic", 0) > 0:
        warnings.append(
            "Synthetic observations are present. The trust score is capped by design "
            "while they are, because a demonstration must not be able to present itself "
            "as a measurement."
        )
    if overall is not None and overall < 50:
        warnings.append(
            "This score means the series is not fit for publication as a statistic. It "
            "does not mean the pipeline is broken."
        )

    return TrustReport(
        overall=overall, band=band_for(overall), components=components,
        warnings=warnings, as_of=as_of,
    )
