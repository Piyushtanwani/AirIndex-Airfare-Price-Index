"""Alternative index formulas.

The headline APIx is a weighted Jevons index, for the reasons given in engine/index.py.
This module computes the other standard bilateral index formulas alongside it, so the
published number can be compared against the alternatives rather than asserted.

Read this before quoting any of them.

A Laspeyres, Paasche, Fisher, Törnqvist or Walsh index is a function of prices AND
quantities in two periods. Airfare scraping observes prices. It does not observe how many
seats were sold at each price, and no public source publishes that at route and
booking-window level in India. So the quantities have to come from somewhere, and where
they come from decides whether these numbers mean anything.

Three modes, and the honest consequences of each:

  fixed                 The same quantity in both periods. Arithmetically this makes
                        Laspeyres and Paasche identical, and therefore Fisher, Walsh and
                        Törnqvist identical to them too. Computing five formulas that are
                        equal by construction and presenting them as five methods is
                        statistical theatre. This mode exists so that fact is visible.

  observed_availability The count of distinct fares observed in a cell, used as a proxy
                        for seats offered. It is genuinely observed and it genuinely
                        varies between periods, but it measures supply on a page, not
                        purchases. It will understate substitution.

  elasticity_model      Quantities implied by a stated own-price elasticity:
                        q_t = q_0 * (p_t / p_0) ** (-epsilon). This is a model, not a
                        measurement. It is defensible because the elasticity is cited and
                        configurable, and indefensible if presented as observed demand.

Default: elasticity_model, with the elasticity taken from configuration. Every result
carries the mode and the elasticity used, so no number from here can be quoted without
its assumption attached.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

import numpy as np


class QuantityMode(str, Enum):
    FIXED = "fixed"
    OBSERVED_AVAILABILITY = "observed_availability"
    ELASTICITY_MODEL = "elasticity_model"


@dataclass
class FormulaResult:
    name: str
    value: float
    description: str
    caveat: str | None = None


@dataclass
class FormulaComparison:
    quantity_mode: str
    elasticity: float | None
    results: list[FormulaResult] = field(default_factory=list)
    headline: str = "jevons"
    spread: float = 0.0
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        return {
            "quantity_mode": self.quantity_mode,
            "elasticity": self.elasticity,
            "headline": self.headline,
            "spread": round(self.spread, 4),
            "results": [
                {
                    "name": r.name,
                    "value": round(r.value, 4),
                    "description": r.description,
                    "caveat": r.caveat,
                }
                for r in self.results
            ],
            "notes": self.notes,
        }


# ---------------------------------------------------------------------------
# The formulas. Each takes aligned arrays and returns an index with base 100.
# ---------------------------------------------------------------------------

def jevons(p0: np.ndarray, pt: np.ndarray, weights: np.ndarray) -> float:
    """Weighted geometric mean of price relatives. The headline formula."""
    valid = (p0 > 0) & (pt > 0) & (weights > 0)
    if not valid.any():
        return float("nan")
    w = weights[valid]
    return 100.0 * float(np.exp(np.sum(w * np.log(pt[valid] / p0[valid])) / np.sum(w)))


def dutot(p0: np.ndarray, pt: np.ndarray, weights: np.ndarray) -> float:
    """Ratio of weighted mean prices. Sensitive to the units of each item, which for
    fares means long routes dominate it. Shown for completeness, not recommended."""
    valid = (p0 > 0) & (pt > 0) & (weights > 0)
    if not valid.any():
        return float("nan")
    w = weights[valid]
    return 100.0 * float(np.sum(w * pt[valid]) / np.sum(w * p0[valid]))


def carli(p0: np.ndarray, pt: np.ndarray, weights: np.ndarray) -> float:
    """Weighted arithmetic mean of price relatives. Known to be upward biased; the
    ILO/IMF manual advises against it. Included because a comparison that omits the
    biased estimator hides the size of the bias."""
    valid = (p0 > 0) & (pt > 0) & (weights > 0)
    if not valid.any():
        return float("nan")
    w = weights[valid]
    return 100.0 * float(np.sum(w * (pt[valid] / p0[valid])) / np.sum(w))


def laspeyres(p0: np.ndarray, pt: np.ndarray, q0: np.ndarray) -> float:
    """Base-period quantities. Answers what the base-period basket costs now."""
    denominator = float(np.sum(p0 * q0))
    if denominator <= 0:
        return float("nan")
    return 100.0 * float(np.sum(pt * q0)) / denominator


def paasche(p0: np.ndarray, pt: np.ndarray, qt: np.ndarray) -> float:
    """Current-period quantities. Answers what today's basket would have cost then."""
    denominator = float(np.sum(p0 * qt))
    if denominator <= 0:
        return float("nan")
    return 100.0 * float(np.sum(pt * qt)) / denominator


def fisher(p0: np.ndarray, pt: np.ndarray, q0: np.ndarray, qt: np.ndarray) -> float:
    """Geometric mean of Laspeyres and Paasche. The superlative index that satisfies the
    time-reversal and factor-reversal tests."""
    left = laspeyres(p0, pt, q0)
    right = paasche(p0, pt, qt)
    if not np.isfinite(left) or not np.isfinite(right) or left <= 0 or right <= 0:
        return float("nan")
    return float(np.sqrt(left * right))


def tornqvist(p0: np.ndarray, pt: np.ndarray, q0: np.ndarray, qt: np.ndarray) -> float:
    """Expenditure-share weighted geometric mean, shares averaged across the two periods.
    Superlative, and the closest of these to the Jevons form."""
    e0 = p0 * q0
    et = pt * qt
    total0 = float(np.sum(e0))
    totalt = float(np.sum(et))
    if total0 <= 0 or totalt <= 0:
        return float("nan")
    s0 = e0 / total0
    st = et / totalt
    shares = 0.5 * (s0 + st)
    valid = (p0 > 0) & (pt > 0) & (shares > 0)
    if not valid.any():
        return float("nan")
    return 100.0 * float(np.exp(np.sum(shares[valid] * np.log(pt[valid] / p0[valid]))))


def walsh(p0: np.ndarray, pt: np.ndarray, q0: np.ndarray, qt: np.ndarray) -> float:
    """Quantities averaged geometrically between the periods."""
    q = np.sqrt(np.clip(q0, 0, None) * np.clip(qt, 0, None))
    denominator = float(np.sum(p0 * q))
    if denominator <= 0:
        return float("nan")
    return 100.0 * float(np.sum(pt * q)) / denominator


# ---------------------------------------------------------------------------
# Quantity construction
# ---------------------------------------------------------------------------

def build_quantities(
    p0: np.ndarray,
    pt: np.ndarray,
    weights: np.ndarray,
    obs0: np.ndarray | None,
    obst: np.ndarray | None,
    mode: QuantityMode,
    elasticity: float,
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Return base-period and current-period quantities, plus the caveats they carry."""
    notes: list[str] = []
    base_quantity = np.clip(weights, 1e-12, None)

    if mode is QuantityMode.FIXED:
        notes.append(
            "Quantities are held fixed, so Laspeyres and Paasche are equal by "
            "construction, and Fisher, Walsh and Törnqvist collapse onto them. The "
            "agreement between these five figures is arithmetic, not evidence."
        )
        return base_quantity, base_quantity.copy(), notes

    if mode is QuantityMode.OBSERVED_AVAILABILITY:
        if obs0 is None or obst is None:
            notes.append(
                "Observation counts were unavailable, so quantities fell back to fixed "
                "weights. Treat the spread between formulas as uninformative."
            )
            return base_quantity, base_quantity.copy(), notes
        q0 = base_quantity * np.clip(obs0, 1e-9, None)
        qt = base_quantity * np.clip(obst, 1e-9, None)
        notes.append(
            "Quantities are the count of fares observed in each cell, scaled by route "
            "weight. This measures how much was offered on the page, not how much was "
            "bought, so substitution between routes is not captured."
        )
        return q0, qt, notes

    safe_p0 = np.clip(p0, 1e-9, None)
    safe_pt = np.clip(pt, 1e-9, None)
    qt = base_quantity * np.power(safe_pt / safe_p0, -abs(elasticity))
    notes.append(
        f"Current-period quantities are modelled from an own-price elasticity of "
        f"{-abs(elasticity):.2f}, not observed. The Laspeyres and Paasche spread below "
        "is therefore a property of that assumption as much as of the market."
    )
    return base_quantity, qt, notes


def compare_formulas(
    p0: np.ndarray,
    pt: np.ndarray,
    weights: np.ndarray,
    *,
    obs0: np.ndarray | None = None,
    obst: np.ndarray | None = None,
    mode: QuantityMode = QuantityMode.ELASTICITY_MODEL,
    elasticity: float = 1.2,
) -> FormulaComparison:
    """Compute every formula on the same cells and report the spread between them.

    The spread is the point of this function. Where the formulas agree, the measured
    movement is robust to the choice of method. Where they disagree, the choice of method
    is doing part of the work, and a statistical office needs to know that before
    adopting the series.
    """
    p0 = np.asarray(p0, dtype=float)
    pt = np.asarray(pt, dtype=float)
    weights = np.asarray(weights, dtype=float)

    keep = (p0 > 0) & (pt > 0) & (weights > 0) & np.isfinite(p0) & np.isfinite(pt)
    if not keep.any():
        return FormulaComparison(
            quantity_mode=mode.value,
            elasticity=elasticity if mode is QuantityMode.ELASTICITY_MODEL else None,
            notes=["No cells had a valid price in both periods."],
        )

    p0, pt, weights = p0[keep], pt[keep], weights[keep]
    obs0_k = np.asarray(obs0, dtype=float)[keep] if obs0 is not None else None
    obst_k = np.asarray(obst, dtype=float)[keep] if obst is not None else None

    q0, qt, notes = build_quantities(p0, pt, weights, obs0_k, obst_k, mode, elasticity)

    results = [
        FormulaResult(
            "jevons", jevons(p0, pt, weights),
            "Weighted geometric mean of price relatives. The published APIx.",
            None,
        ),
        FormulaResult(
            "laspeyres", laspeyres(p0, pt, q0),
            "Base-period basket valued at current prices.",
            "Upward biased when travellers substitute away from routes that rose.",
        ),
        FormulaResult(
            "paasche", paasche(p0, pt, qt),
            "Current basket valued at base prices.",
            "Downward biased for the mirror-image reason.",
        ),
        FormulaResult(
            "fisher", fisher(p0, pt, q0, qt),
            "Geometric mean of Laspeyres and Paasche. Superlative.",
            "Inherits whatever the quantity assumption contributed.",
        ),
        FormulaResult(
            "tornqvist", tornqvist(p0, pt, q0, qt),
            "Expenditure-share weighted geometric mean. Superlative.",
            "Inherits whatever the quantity assumption contributed.",
        ),
        FormulaResult(
            "walsh", walsh(p0, pt, q0, qt),
            "Geometrically averaged quantities.",
            "Inherits whatever the quantity assumption contributed.",
        ),
        FormulaResult(
            "dutot", dutot(p0, pt, weights),
            "Ratio of average prices.",
            "Dominated by expensive long-haul cells. Not recommended for this basket.",
        ),
        FormulaResult(
            "carli", carli(p0, pt, weights),
            "Arithmetic mean of price relatives.",
            "Known upward bias. Shown so the size of that bias is visible.",
        ),
    ]

    finite = [r.value for r in results if np.isfinite(r.value)]
    spread = (max(finite) - min(finite)) if len(finite) > 1 else 0.0

    superlative = [
        r.value for r in results
        if r.name in {"fisher", "tornqvist", "walsh"} and np.isfinite(r.value)
    ]
    jevons_value = results[0].value
    if superlative and np.isfinite(jevons_value):
        gap = max(abs(jevons_value - s) for s in superlative)
        if gap > 1.0:
            notes.append(
                f"The published Jevons index differs from the superlative indices by up "
                f"to {gap:.2f} points. That gap is a substitution effect the elementary "
                "aggregate cannot see, and it should be reported alongside the headline."
            )
        else:
            notes.append(
                f"The published Jevons index sits within {gap:.2f} points of the "
                "superlative indices, so the headline movement is not an artefact of the "
                "formula."
            )

    return FormulaComparison(
        quantity_mode=mode.value,
        elasticity=elasticity if mode is QuantityMode.ELASTICITY_MODEL else None,
        results=results,
        spread=spread,
        notes=notes,
    )
