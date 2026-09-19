"""Back-testing.

An honest statement of what this can and cannot do.

The proposal promises a thirty-day back-test. A back-test in the usual sense compares a
computed series against an independent reference series and reports how closely it
tracks it. India publishes no public high-frequency airfare index, so for the airfare
index there is no reference series to compare against. Reporting correlation and mean
absolute error against a reference that does not exist would be fabrication.

What this module does instead is measure the properties a statistical office actually
interrogates before adopting a series:

  stability      how much a published value moves when recomputed on later data
  revision       the size and direction of those revisions
  coverage       how often the series clears its publication threshold
  robustness     how much the index changes under a different but defensible choice,
                 for example a different outlier threshold or the mean rather than the
                 minimum fare
  sensitivity    how much the index depends on any single route, by leave-one-out

These are internal diagnostics, and they are labelled as such everywhere they appear. If
a reference series becomes available, `compare_against_reference` computes the external
metrics the proposal names, and it refuses to run on anything else.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from engine import index as index_mod


@dataclass
class BacktestReport:
    kind: str
    days: int
    metrics: dict[str, float | None] = field(default_factory=dict)
    series: list[dict[str, object]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        return {
            "kind": self.kind,
            "days": self.days,
            "metrics": self.metrics,
            "series": self.series,
            "notes": self.notes,
        }


def replay(
    prices: pd.DataFrame,
    weights: dict[str, float],
    *,
    base_window: index_mod.BaseWindow,
    min_coverage: float,
    days: int = 30,
) -> BacktestReport:
    """Recompute the index as it would have stood on each of the last `days` days.

    On each simulated day the computation sees only the data available up to that day.
    The final value for a date is then compared with the value first published for it,
    which is what a revision actually is.
    """
    report = BacktestReport(kind="stability_replay", days=days)
    if prices.empty:
        report.notes.append("no price data to replay")
        return report

    all_dates = sorted(prices["date"].unique())
    if len(all_dates) < 2:
        report.notes.append("need at least two days of data to replay")
        return report

    replay_dates = all_dates[-days:]
    base_prices = index_mod.compute_base_prices(prices, base_window)
    if not base_prices:
        report.notes.append("base window contains no observations")
        return report

    first_published: dict[dt.date, float] = {}
    coverage_by_date: dict[dt.date, float] = {}
    published_flags: dict[dt.date, bool] = {}

    for as_of in replay_dates:
        visible = prices[prices["date"] <= as_of]
        series = index_mod.compute_series(
            index_mod.IndexInputs(
                prices=visible, weights=weights, min_coverage=min_coverage
            ),
            base_prices,
        )
        if series.empty:
            continue
        row = series[series["date"] == as_of]
        if row.empty:
            continue
        first_published[as_of] = float(row.iloc[0]["apix"])
        coverage_by_date[as_of] = float(row.iloc[0]["coverage"])
        published_flags[as_of] = bool(row.iloc[0]["published"])

    final_series = index_mod.compute_series(
        index_mod.IndexInputs(prices=prices, weights=weights, min_coverage=min_coverage),
        base_prices,
    )
    final_by_date = {row.date: float(row.apix) for row in final_series.itertuples()}

    revisions = []
    rows = []
    for date in replay_dates:
        first = first_published.get(date)
        final = final_by_date.get(date)
        if first is None or final is None:
            continue
        revision = final - first
        revisions.append(revision)
        rows.append({
            "date": date.isoformat(),
            "first_published": round(first, 4),
            "final": round(final, 4),
            "revision": round(revision, 4),
            "revision_pct": round((final / first - 1) * 100, 4) if first else None,
            "coverage": round(coverage_by_date.get(date, 0.0), 4),
            "published": published_flags.get(date, False),
        })

    report.series = rows
    if revisions:
        array = np.array(revisions, dtype=float)
        report.metrics = {
            "mean_absolute_revision": round(float(np.mean(np.abs(array))), 4),
            "max_absolute_revision": round(float(np.max(np.abs(array))), 4),
            "mean_revision": round(float(np.mean(array)), 4),
            "revision_bias_direction": (
                "upward" if float(np.mean(array)) > 0.01
                else "downward" if float(np.mean(array)) < -0.01
                else "none"
            ),
            "days_compared": float(len(revisions)),
            "publication_rate": round(
                float(sum(1 for r in rows if r["published"]) / max(1, len(rows))), 4
            ),
            "mean_coverage": round(
                float(np.mean([r["coverage"] for r in rows])) if rows else 0.0, 4
            ),
        }
        if float(np.max(np.abs(array))) == 0.0:
            report.notes.append(
                "Every revision is zero. On a history generated in one batch that is the "
                "expected result and not evidence of a stable series: a revision can only "
                "arise when an observation arrives after its day was first published, and "
                "nothing here arrived late. This metric becomes informative once the "
                "collector has been running against a live source across several days."
            )
    else:
        report.notes.append("no dates could be compared")
    return report


def leave_one_out(
    prices: pd.DataFrame,
    weights: dict[str, float],
    *,
    base_window: index_mod.BaseWindow,
    min_coverage: float,
) -> BacktestReport:
    """How much does the index depend on any single route?

    Recompute the latest value with each route removed in turn. A basket where one route
    can move the headline number by a large margin is a basket that is too small, and it
    is better to know that before publishing than after.
    """
    report = BacktestReport(kind="leave_one_out", days=0)
    if prices.empty:
        report.notes.append("no price data")
        return report

    base_prices = index_mod.compute_base_prices(prices, base_window)
    full = index_mod.compute_series(
        index_mod.IndexInputs(prices=prices, weights=weights, min_coverage=min_coverage),
        base_prices,
    )
    if full.empty:
        report.notes.append("index could not be computed on the full basket")
        return report

    latest_date = full["date"].max()
    baseline = float(full[full["date"] == latest_date].iloc[0]["apix"])

    routes = sorted({str(cell).split("|")[0] for cell in prices["cell"].unique()})
    rows = []
    for route in routes:
        kept = prices[~prices["cell"].astype(str).str.startswith(f"{route}|")]
        kept_weights = {
            c: w for c, w in weights.items() if not str(c).startswith(f"{route}|")
        }
        if kept.empty or not kept_weights:
            continue
        subset_base = {c: p for c, p in base_prices.items() if not c.startswith(f"{route}|")}
        series = index_mod.compute_series(
            index_mod.IndexInputs(
                prices=kept,
                weights=index_mod.normalise_weights(kept_weights),
                min_coverage=0.0,
            ),
            subset_base,
        )
        row = series[series["date"] == latest_date]
        if row.empty:
            continue
        without = float(row.iloc[0]["apix"])
        rows.append({
            "route_excluded": route,
            "apix_without": round(without, 4),
            "delta": round(without - baseline, 4),
        })

    report.series = sorted(rows, key=lambda r: abs(float(r["delta"])), reverse=True)
    if rows:
        deltas = np.array([float(r["delta"]) for r in rows])
        report.metrics = {
            "baseline_apix": round(baseline, 4),
            "max_single_route_influence": round(float(np.max(np.abs(deltas))), 4),
            "mean_absolute_influence": round(float(np.mean(np.abs(deltas))), 4),
            "routes_tested": float(len(rows)),
        }
    return report


def robustness_to_threshold(
    prices_by_threshold: dict[float, pd.DataFrame],
    weights: dict[str, float],
    *,
    base_window: index_mod.BaseWindow,
    min_coverage: float,
) -> BacktestReport:
    """How much does the index move under a different outlier threshold?

    The caller supplies one price frame per threshold, because recomputing cells from
    fares is the pipeline's job, not this module's. A result that swings with the
    threshold means the rule, not the market, is driving the number.
    """
    report = BacktestReport(kind="outlier_robustness", days=0)
    if not prices_by_threshold:
        report.notes.append("no variants supplied")
        return report

    values: dict[float, float] = {}
    for threshold, frame in sorted(prices_by_threshold.items()):
        if frame.empty:
            continue
        base_prices = index_mod.compute_base_prices(frame, base_window)
        series = index_mod.compute_series(
            index_mod.IndexInputs(prices=frame, weights=weights, min_coverage=min_coverage),
            base_prices,
        )
        if series.empty:
            continue
        values[threshold] = float(series.iloc[-1]["apix"])

    report.series = [
        {"mad_threshold": t, "apix": round(v, 4)} for t, v in sorted(values.items())
    ]
    if len(values) > 1:
        spread = max(values.values()) - min(values.values())
        report.metrics = {
            "spread": round(float(spread), 4),
            "variants_tested": float(len(values)),
        }
    return report


def compare_against_reference(
    computed: pd.DataFrame, reference: pd.DataFrame
) -> BacktestReport:
    """The external back-test, for when a reference series exists.

    `computed` and `reference` must both have `date` and `value` columns. This function
    refuses to invent a reference: given an empty one it returns a report saying so,
    rather than producing metrics against nothing.
    """
    report = BacktestReport(kind="reference_comparison", days=0)
    if reference is None or reference.empty:
        report.notes.append(
            "no reference series supplied. No public high-frequency Indian airfare index "
            "exists, so external correlation, mean absolute error, root mean squared "
            "error and directional accuracy cannot be reported. Use the stability, "
            "coverage and sensitivity diagnostics instead."
        )
        return report

    merged = computed.merge(reference, on="date", suffixes=("_computed", "_reference"))
    if merged.empty:
        report.notes.append("no overlapping dates between the two series")
        return report

    a = merged["value_computed"].to_numpy(dtype=float)
    b = merged["value_reference"].to_numpy(dtype=float)
    errors = a - b

    if len(a) > 2:
        direction_a = np.sign(np.diff(a))
        direction_b = np.sign(np.diff(b))
        directional = float(np.mean(direction_a == direction_b))
        correlation = float(np.corrcoef(a, b)[0, 1])
    else:
        directional = float("nan")
        correlation = float("nan")

    report.days = int(len(merged))
    report.metrics = {
        "correlation": None if np.isnan(correlation) else round(correlation, 4),
        "mae": round(float(np.mean(np.abs(errors))), 4),
        "rmse": round(float(np.sqrt(np.mean(errors**2))), 4),
        "directional_accuracy": None if np.isnan(directional) else round(directional, 4),
        "observations": float(len(merged)),
    }
    return report
