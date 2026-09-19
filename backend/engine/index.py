"""The index.

    APIx_t = 100 * exp( SUM_i w_i * ln(P_i_t / P_i_0) / SUM_i w_i )

A weighted Jevons index: a geometric mean of price relatives. This is the elementary
aggregate formula the ILO/IMF Consumer Price Index Manual prescribes where expenditure
weights within the aggregate are unavailable, and the one the UK Office for National
Statistics uses for its web-scraped price indices. It is deliberately not a bespoke
formula. A national statistical office cannot adopt a method it has to take on faith.

Why a geometric rather than an arithmetic mean: the geometric mean is invariant to which
period is used as the base, and it does not let one expensive cell dominate the index the
way an arithmetic mean of relatives does. Airfares span an order of magnitude across
routes, so that property is not academic here.

Everything in this module is a pure function over dataframes. No database, no clock.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class BaseWindow:
    """The reference period. Fixed once, then never recomputed from moving data."""

    start: dt.date
    end: dt.date
    days: int


@dataclass(frozen=True)
class IndexInputs:
    """Everything the computation needs, assembled by the caller.

    prices: long frame with columns date, cell, price, obs_count.
            `cell` is an opaque key. The caller decides whether a cell is a route and a
            lead time, a route alone, or a carrier's route and lead time.
    weights: cell key to weight. Need not be normalised.
    """

    prices: pd.DataFrame
    weights: dict[str, float]
    min_coverage: float


def carry_forward(prices: pd.DataFrame) -> pd.DataFrame:
    """Fill gaps in each cell's series with its last known price.

    Returns the frame with `price` filled and an `imputed` column recording where that
    happened. A cell is never back-filled: a gap before a cell's first observation stays
    a gap, because inventing a price that precedes any measurement is not imputation, it
    is fabrication.
    """
    if prices.empty:
        out = prices.copy()
        out["imputed"] = pd.Series(dtype=bool)
        return out

    df = prices.sort_values(["cell", "date"]).copy()
    df["imputed"] = df["price"].isna()
    df["price"] = df.groupby("cell")["price"].ffill()
    # Rows still empty had no earlier observation at all.
    df["imputed"] = df["imputed"] & df["price"].notna()
    return df


def find_base_window(
    prices: pd.DataFrame,
    weights: dict[str, float],
    *,
    days: int,
    min_coverage: float,
) -> BaseWindow | None:
    """The first run of `days` consecutive dates that each clear the coverage threshold.

    A single-day base is fragile: one promotional fare inside it deflates the base price
    of that cell and inflates every relative computed against it for the rest of the
    series. Averaging over several qualifying days costs nothing and removes that
    failure mode.

    Returns None when the series is not yet long enough, which is a normal state for a
    freshly started collection, not an error.
    """
    if prices.empty or days < 1:
        return None

    total_weight = sum(weights.values())
    if total_weight <= 0:
        return None

    coverage_by_date: dict[dt.date, float] = {}
    for date, group in prices.groupby("date"):
        priced = group[group["price"].notna()]["cell"]
        covered = sum(weights.get(cell, 0.0) for cell in priced)
        coverage_by_date[date] = covered / total_weight

    dates = sorted(coverage_by_date)
    qualifying = [d for d in dates if coverage_by_date[d] >= min_coverage]
    if len(qualifying) < days:
        return None

    # Require the days to be genuinely consecutive calendar days, not merely the first
    # `days` qualifying dates scattered across a month.
    for i in range(len(qualifying) - days + 1):
        window = qualifying[i : i + days]
        if (window[-1] - window[0]).days == days - 1:
            return BaseWindow(start=window[0], end=window[-1], days=days)

    # No consecutive run. Fall back to the earliest qualifying days and say so through
    # the returned span, which the caller records.
    window = qualifying[:days]
    return BaseWindow(start=window[0], end=window[-1], days=days)


def compute_base_prices(prices: pd.DataFrame, window: BaseWindow) -> dict[str, float]:
    """Mean observed price per cell across the base window.

    Only genuinely observed prices count. A cell with no observation inside the window
    gets no base price and is therefore excluded from the index until the base is
    recomputed, which is the honest outcome: there is nothing to measure it against.
    """
    if prices.empty:
        return {}
    mask = (prices["date"] >= window.start) & (prices["date"] <= window.end)
    inside = prices[mask]
    inside = inside[inside["price"].notna() & (inside["price"] > 0)]
    if inside.empty:
        return {}
    return {
        str(cell): float(value)
        for cell, value in inside.groupby("cell")["price"].mean().items()
        if value > 0
    }


def compute_series(
    inputs: IndexInputs,
    base_prices: dict[str, float],
) -> pd.DataFrame:
    """The index itself, one row per date.

    Columns returned: date, apix, coverage, obs_count, cells_used, imputed_cells,
    published (bool). A date below the coverage threshold is returned with
    published=False rather than dropped, so a gap in the published series is visible and
    explainable instead of silently absent.
    """
    columns = [
        "date", "apix", "coverage", "obs_count", "cells_used", "imputed_cells", "published",
    ]
    if inputs.prices.empty or not base_prices:
        return pd.DataFrame(columns=columns)

    filled = carry_forward(inputs.prices)
    # A cell without a base price cannot contribute a relative.
    filled = filled[filled["cell"].isin(base_prices.keys())]
    if filled.empty:
        return pd.DataFrame(columns=columns)

    weights = {c: float(inputs.weights.get(c, 0.0)) for c in base_prices}
    total_weight = sum(w for w in weights.values() if w > 0)
    if total_weight <= 0:
        return pd.DataFrame(columns=columns)

    rows = []
    for date, group in filled.groupby("date", sort=True):
        usable = group[group["price"].notna() & (group["price"] > 0)]
        if usable.empty:
            continue

        cell_keys = usable["cell"].astype(str).to_numpy()
        cell_weights = np.array([weights.get(c, 0.0) for c in cell_keys], dtype=float)
        keep = cell_weights > 0
        if not keep.any():
            continue

        observed = usable["price"].to_numpy(dtype=float)[keep]
        bases = np.array([base_prices[c] for c in cell_keys[keep]], dtype=float)
        cell_weights = cell_weights[keep]

        log_relatives = np.log(observed / bases)
        weighted_mean_log = float(np.sum(cell_weights * log_relatives) / np.sum(cell_weights))
        apix = 100.0 * float(np.exp(weighted_mean_log))

        imputed_mask = usable["imputed"].to_numpy(dtype=bool)[keep]
        fresh_weight = float(np.sum(cell_weights[~imputed_mask]))
        coverage = fresh_weight / total_weight

        obs_count = int(pd.to_numeric(usable["obs_count"], errors="coerce").fillna(0).sum())

        rows.append({
            "date": date,
            "apix": round(apix, 4),
            "coverage": round(coverage, 4),
            "obs_count": obs_count,
            "cells_used": int(keep.sum()),
            "imputed_cells": int(imputed_mask.sum()),
            "published": coverage >= inputs.min_coverage,
        })

    frame = pd.DataFrame(rows, columns=columns)
    return frame.sort_values("date").reset_index(drop=True)


def add_changes(series: pd.DataFrame) -> pd.DataFrame:
    """Week-on-week and month-on-month percentage change.

    Computed against the value seven and thirty calendar days earlier, not seven and
    thirty rows earlier. Those differ whenever a day failed to publish, and using row
    offsets would quietly compare across a gap.
    """
    if series.empty:
        out = series.copy()
        out["wow_pct"] = pd.Series(dtype=float)
        out["mom_pct"] = pd.Series(dtype=float)
        return out

    df = series.sort_values("date").reset_index(drop=True).copy()
    by_date = {row.date: row.apix for row in df.itertuples()}

    def change(current_date: dt.date, current_value: float, lag_days: int) -> float | None:
        previous = by_date.get(current_date - dt.timedelta(days=lag_days))
        if previous is None or previous <= 0:
            return None
        return round((current_value / previous - 1.0) * 100.0, 4)

    df["wow_pct"] = [change(r.date, r.apix, 7) for r in df.itertuples()]
    df["mom_pct"] = [change(r.date, r.apix, 30) for r in df.itertuples()]
    return df


def compute_index(
    prices: pd.DataFrame,
    weights: dict[str, float],
    *,
    base_window: BaseWindow,
    min_coverage: float,
    base_prices: dict[str, float] | None = None,
) -> tuple[pd.DataFrame, dict[str, float]]:
    """Convenience wrapper: base prices, series, changes, in one call.

    Returns the series and the base prices used, so the caller can persist the base and
    reuse it on the next run instead of letting it drift.
    """
    resolved_base = base_prices or compute_base_prices(prices, base_window)
    series = compute_series(
        IndexInputs(prices=prices, weights=weights, min_coverage=min_coverage),
        resolved_base,
    )
    return add_changes(series), resolved_base


def normalise_weights(weights: dict[str, float]) -> dict[str, float]:
    """Scale a weight mapping to sum to one. Zero and negative weights are dropped."""
    positive = {k: float(v) for k, v in weights.items() if v and float(v) > 0}
    total = sum(positive.values())
    if total <= 0:
        return {}
    return {k: v / total for k, v in positive.items()}


def contribution_analysis(
    prices: pd.DataFrame,
    weights: dict[str, float],
    base_prices: dict[str, float],
    on_date: dt.date,
    previous_date: dt.date,
) -> pd.DataFrame:
    """How much each cell moved the index between two dates.

    The additive decomposition of a Jevons index is in log space: each cell contributes
    w_i * (ln r_i_t - ln r_i_prev) to the change in the weighted mean log. This answers
    the first question any analyst asks of a move, which is which routes caused it.
    """
    columns = ["cell", "weight", "price_now", "price_prev", "pct_change", "contribution_pct"]
    if prices.empty or not base_prices:
        return pd.DataFrame(columns=columns)

    filled = carry_forward(prices)
    now = filled[filled["date"] == on_date].set_index("cell")["price"]
    prev = filled[filled["date"] == previous_date].set_index("cell")["price"]
    shared = [c for c in base_prices if c in now.index and c in prev.index]
    if not shared:
        return pd.DataFrame(columns=columns)

    normalised = normalise_weights({c: weights.get(c, 0.0) for c in shared})
    rows = []
    for cell in shared:
        weight = normalised.get(cell, 0.0)
        price_now = float(now[cell])
        price_prev = float(prev[cell])
        if weight <= 0 or price_now <= 0 or price_prev <= 0:
            continue
        delta_log = np.log(price_now) - np.log(price_prev)
        rows.append({
            "cell": cell,
            "weight": round(weight, 6),
            "price_now": round(price_now, 2),
            "price_prev": round(price_prev, 2),
            "pct_change": round((price_now / price_prev - 1) * 100, 4),
            "contribution_pct": round(weight * delta_log * 100, 6),
        })

    frame = pd.DataFrame(rows, columns=columns)
    if frame.empty:
        return frame
    return frame.sort_values("contribution_pct", key=abs, ascending=False).reset_index(drop=True)
