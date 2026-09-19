"""Reduce validated fares to one price per priced cell per day.

A cell is a route and a booking lead time. The price of a cell on a day is the cheapest
valid total fare observed in it, across every airline and departure time. That statistic
is chosen deliberately:

  - It is a price a traveller could actually have transacted at, which a mean of the
    displayed fares is not.
  - It does not move when a portal reorders its results or adds a carrier to the page.
  - It is what a household comparing options would anchor on.

The cost is that it is a minimum, so it is sensitive to a single mispriced observation.
That is precisely why the outlier rule runs before this step and not after it.
"""

from __future__ import annotations

import pandas as pd

CELL_KEYS = ("observation_date", "route_id", "lead_time_days")


def build_cells(fares: pd.DataFrame) -> pd.DataFrame:
    """Collapse fares to cells.

    Expects the output of the quality module: one row per observation with `is_valid`,
    `total_fare` and the cell keys. Invalid rows are counted but do not set the price.

    Returns columns: date, route_id, lead_time_days, min_logical_fare, mean_fare,
    obs_count, outliers_excluded, airlines_seen, imputed.
    """
    columns = [
        "date", "route_id", "lead_time_days", "min_logical_fare", "mean_fare",
        "obs_count", "outliers_excluded", "airlines_seen", "imputed",
    ]
    if fares.empty:
        return pd.DataFrame(columns=columns)

    df = fares.copy()
    df["total_fare"] = pd.to_numeric(df["total_fare"], errors="coerce")
    valid = df[df["is_valid"].astype(bool)]

    rows = []
    # Group over every cell that produced any observation, valid or not, so a cell whose
    # entire content was rejected still appears with obs_count zero rather than vanishing.
    for (obs_date, route_id, lead_time), group in df.groupby(list(CELL_KEYS), sort=True):
        valid_group = valid[
            (valid["observation_date"] == obs_date)
            & (valid["route_id"] == route_id)
            & (valid["lead_time_days"] == lead_time)
        ]
        outliers = 0
        if "quality_flags" in group.columns:
            outliers = int(
                sum(1 for flags in group["quality_flags"] if flags and "outlier_mad" in flags)
            )
        if valid_group.empty:
            rows.append({
                "date": obs_date,
                "route_id": int(route_id),
                "lead_time_days": int(lead_time),
                "min_logical_fare": None,
                "mean_fare": None,
                "obs_count": 0,
                "outliers_excluded": outliers,
                "airlines_seen": [],
                "imputed": False,
            })
            continue

        rows.append({
            "date": obs_date,
            "route_id": int(route_id),
            "lead_time_days": int(lead_time),
            "min_logical_fare": float(valid_group["total_fare"].min()),
            "mean_fare": round(float(valid_group["total_fare"].mean()), 2),
            "obs_count": int(len(valid_group)),
            "outliers_excluded": outliers,
            "airlines_seen": sorted(set(valid_group["airline_code"].astype(str))),
            "imputed": False,
        })

    return pd.DataFrame(rows, columns=columns)


def build_airline_cells(fares: pd.DataFrame) -> pd.DataFrame:
    """The same reduction, split by carrier, for the per-airline index.

    A separate function rather than a parameter, because the per-airline series is a
    secondary output and must never be confused with the headline basket.
    """
    columns = [
        "date", "route_id", "lead_time_days", "airline_code",
        "min_logical_fare", "obs_count",
    ]
    if fares.empty:
        return pd.DataFrame(columns=columns)

    df = fares.copy()
    df["total_fare"] = pd.to_numeric(df["total_fare"], errors="coerce")
    valid = df[df["is_valid"].astype(bool)]
    if valid.empty:
        return pd.DataFrame(columns=columns)

    grouped = (
        valid.groupby(
            ["observation_date", "route_id", "lead_time_days", "airline_code"], sort=True
        )["total_fare"]
        .agg(["min", "count"])
        .reset_index()
    )
    grouped = grouped.rename(
        columns={
            "observation_date": "date",
            "min": "min_logical_fare",
            "count": "obs_count",
        }
    )
    return grouped[columns]


def apply_min_observations(cells: pd.DataFrame, min_obs: int) -> pd.DataFrame:
    """Blank the price of any cell that is too thin to price.

    The cell keeps its row and its observation count. The index module then carries the
    last published relative forward and marks the cell imputed. Doing it here rather
    than in the index keeps the reason for the gap next to the data that caused it.
    """
    if cells.empty:
        return cells
    out = cells.copy()
    thin = out["obs_count"] < min_obs
    out.loc[thin, "min_logical_fare"] = None
    return out
