"""Validation and outlier rules.

Two jobs, kept apart on purpose:

1. `validate_fares` decides whether an individual observation is believable at all. It
   knows nothing about other observations.
2. `flag_outliers` decides whether a believable observation is out of line with its own
   cell. It needs the cell's distribution.

Both attach flags instead of deleting rows. Nothing in AirIndex silently discards an
observation: an excluded fare stays in the database with the reason recorded, because a
statistical office will ask what was thrown away and why.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# Flag vocabulary. Anything that excludes a fare from the index starts with "reject_"
# or "outlier_"; anything advisory does not.
FLAG_NON_INR = "reject_non_inr"
FLAG_NON_POSITIVE = "reject_non_positive_fare"
FLAG_BELOW_FLOOR = "reject_below_plausible_floor"
FLAG_ABOVE_CEILING = "reject_above_plausible_ceiling"
FLAG_BAD_LEAD_TIME = "reject_lead_time_out_of_range"
FLAG_NEGATIVE_COMPONENT = "reject_negative_component"
FLAG_COMPONENTS_MISMATCH = "components_do_not_sum"
FLAG_NOT_ITEMISED = "components_apportioned"
FLAG_NON_ECONOMY = "reject_non_economy_cabin"
FLAG_OUTLIER_MAD = "outlier_mad"
FLAG_DUPLICATE = "reject_duplicate"

REJECTING_PREFIXES = ("reject_", "outlier_")


def is_rejecting(flags: list[str]) -> bool:
    return any(flag.startswith(REJECTING_PREFIXES) for flag in flags)


def validate_fares(
    frame: pd.DataFrame,
    *,
    min_fare: float,
    max_fare: float,
    max_lead_time_days: int,
    lead_times: list[int],
) -> pd.DataFrame:
    """Per-observation validation.

    Expects columns: total_fare, base_fare, taxes, udf, convenience_fee, currency,
    lead_time_days, cabin. Returns the frame with `quality_flags` and `is_valid` set.

    A fare is valid when it is in Rupees, positive, inside the plausible range, in
    economy, and sits on one of the lead times the basket prices. Everything else is
    kept and marked.
    """
    if frame.empty:
        out = frame.copy()
        out["quality_flags"] = pd.Series(dtype=object)
        out["is_valid"] = pd.Series(dtype=bool)
        return out

    df = frame.copy()
    flags: list[list[str]] = [[] for _ in range(len(df))]

    def mark(mask: pd.Series, flag: str) -> None:
        for position in np.flatnonzero(mask.to_numpy()):
            flags[int(position)].append(flag)

    total = pd.to_numeric(df["total_fare"], errors="coerce")

    mark(df["currency"].astype(str).str.upper() != "INR", FLAG_NON_INR)
    mark(total.isna() | (total <= 0), FLAG_NON_POSITIVE)
    mark(total.notna() & (total > 0) & (total < min_fare), FLAG_BELOW_FLOOR)
    mark(total.notna() & (total > max_fare), FLAG_ABOVE_CEILING)

    lead = pd.to_numeric(df["lead_time_days"], errors="coerce")
    bad_lead = lead.isna() | (lead < 0) | (lead > max_lead_time_days) | (~lead.isin(lead_times))
    mark(bad_lead, FLAG_BAD_LEAD_TIME)

    if "cabin" in df.columns:
        mark(df["cabin"].astype(str) != "economy", FLAG_NON_ECONOMY)

    components = ["base_fare", "taxes", "udf", "convenience_fee"]
    present = [c for c in components if c in df.columns]
    if present:
        component_frame = df[present].apply(pd.to_numeric, errors="coerce").fillna(0.0)
        mark((component_frame < 0).any(axis=1), FLAG_NEGATIVE_COMPONENT)
        summed = component_frame.sum(axis=1)
        # One rupee of tolerance for rounding in the source.
        mark(total.notna() & ((summed - total).abs() > 1.0), FLAG_COMPONENTS_MISMATCH)

    if "components_were_split" in df.columns:
        mark(~df["components_were_split"].astype(bool), FLAG_NOT_ITEMISED)

    df["quality_flags"] = flags
    df["is_valid"] = [not is_rejecting(f) for f in flags]
    return df


def modified_z_scores(values: np.ndarray) -> np.ndarray:
    """Median absolute deviation based z-scores, computed on logarithms.

    Fare distributions are right-skewed: the cheap tail is bounded and the expensive tail
    is not. Taking logarithms first stops the rule from treating an ordinary expensive
    fare as an outlier while missing an implausibly cheap one.

    The 0.6745 constant makes the statistic comparable to a standard deviation for
    normally distributed data.
    """
    if values.size == 0:
        return np.array([])
    logged = np.log(values)
    median = np.median(logged)
    deviations = np.abs(logged - median)
    mad = np.median(deviations)
    if mad == 0:
        # Every value identical, or a tie-heavy cell. Fall back to the mean absolute
        # deviation so a single different value is still detectable.
        mean_abs = deviations.mean()
        if mean_abs == 0:
            return np.zeros_like(logged)
        return 0.7979 * (logged - median) / mean_abs
    return 0.6745 * (logged - median) / mad


def flag_outliers(
    frame: pd.DataFrame,
    *,
    threshold: float,
    group_columns: tuple[str, ...] = ("observation_date", "route_id", "lead_time_days"),
    min_group_size: int = 4,
) -> pd.DataFrame:
    """Add the MAD outlier flag within each cell.

    Cells smaller than `min_group_size` are left alone. With three observations the
    median absolute deviation is not a meaningful dispersion estimate, and applying it
    anyway would discard real prices from exactly the thin cells that need them most.
    """
    if frame.empty:
        return frame.copy()

    df = frame.copy()
    if "quality_flags" not in df.columns:
        df["quality_flags"] = [[] for _ in range(len(df))]
    if "is_valid" not in df.columns:
        df["is_valid"] = True

    df["_outlier"] = False
    eligible = df["is_valid"].astype(bool)

    for _, group in df[eligible].groupby(list(group_columns), sort=False):
        if len(group) < min_group_size:
            continue
        values = pd.to_numeric(group["total_fare"], errors="coerce").to_numpy(dtype=float)
        if np.any(~np.isfinite(values)) or np.any(values <= 0):
            continue
        scores = modified_z_scores(values)
        outlier_positions = group.index[np.abs(scores) > threshold]
        df.loc[outlier_positions, "_outlier"] = True

    outlier_index = df.index[df["_outlier"]]
    for idx in outlier_index:
        current = list(df.at[idx, "quality_flags"])
        if FLAG_OUTLIER_MAD not in current:
            current.append(FLAG_OUTLIER_MAD)
        df.at[idx, "quality_flags"] = current
    df.loc[outlier_index, "is_valid"] = False
    return df.drop(columns=["_outlier"])


def summarise_flags(frame: pd.DataFrame) -> dict[str, int]:
    """Count every flag occurrence, for the data quality page."""
    counts: dict[str, int] = {}
    if frame.empty or "quality_flags" not in frame.columns:
        return counts
    for flags in frame["quality_flags"]:
        for flag in flags or []:
            counts[flag] = counts.get(flag, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: -kv[1]))
