"""Tests for the index formula.

The golden test below is the one that matters. If it fails, the published number has
changed meaning, and that is either a bug or a methodology change that needs a version
bump. There is no third possibility.
"""

from __future__ import annotations

import datetime as dt
import math

import numpy as np
import pandas as pd
import pytest

from engine import index as index_mod


def make_prices(rows: list[tuple[str, str, float, int]]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "date": dt.date.fromisoformat(date),
                "cell": cell,
                "price": price,
                "obs_count": obs,
            }
            for date, cell, price, obs in rows
        ]
    )


class TestJevonsFormula:
    def test_golden_value(self):
        """A hand-computed weighted Jevons index.

        Two cells. Cell A doubles in price with weight 0.25; cell B is unchanged with
        weight 0.75. The weighted mean of log relatives is 0.25 * ln(2) = 0.1733, so the
        index is 100 * exp(0.1733) = 118.92.
        """
        prices = make_prices([
            ("2026-01-01", "A", 100.0, 5),
            ("2026-01-01", "B", 100.0, 5),
            ("2026-01-02", "A", 200.0, 5),
            ("2026-01-02", "B", 100.0, 5),
        ])
        weights = {"A": 0.25, "B": 0.75}
        base = {"A": 100.0, "B": 100.0}

        series = index_mod.compute_series(
            index_mod.IndexInputs(prices=prices, weights=weights, min_coverage=0.0), base
        )
        latest = series[series["date"] == dt.date(2026, 1, 2)].iloc[0]
        expected = 100.0 * math.exp(0.25 * math.log(2))

        assert latest["apix"] == pytest.approx(expected, abs=1e-4)
        assert latest["apix"] == pytest.approx(118.9207, abs=1e-3)

    def test_base_period_is_exactly_one_hundred(self):
        prices = make_prices([
            ("2026-01-01", "A", 100.0, 5),
            ("2026-01-01", "B", 250.0, 5),
        ])
        weights = {"A": 0.5, "B": 0.5}
        base = {"A": 100.0, "B": 250.0}
        series = index_mod.compute_series(
            index_mod.IndexInputs(prices=prices, weights=weights, min_coverage=0.0), base
        )
        assert series.iloc[0]["apix"] == pytest.approx(100.0, abs=1e-9)

    def test_geometric_mean_is_base_invariant(self):
        """Rebasing must not change the measured movement.

        This is the property that makes a geometric mean the right choice, so it is worth
        a test rather than a comment.
        """
        prices = make_prices([
            ("2026-01-01", "A", 100.0, 5),
            ("2026-01-01", "B", 400.0, 5),
            ("2026-01-02", "A", 110.0, 5),
            ("2026-01-02", "B", 360.0, 5),
        ])
        weights = {"A": 0.5, "B": 0.5}

        original = index_mod.compute_series(
            index_mod.IndexInputs(prices, weights, 0.0), {"A": 100.0, "B": 400.0}
        )
        # Halve every base price. The index level doubles, the ratio between days does not.
        rebased = index_mod.compute_series(
            index_mod.IndexInputs(prices, weights, 0.0), {"A": 50.0, "B": 200.0}
        )
        original_move = original.iloc[1]["apix"] / original.iloc[0]["apix"]
        rebased_move = rebased.iloc[1]["apix"] / rebased.iloc[0]["apix"]
        # Tolerance reflects the four decimal places the stored index is rounded to,
        # which is the precision the API publishes.
        assert original_move == pytest.approx(rebased_move, abs=1e-6)

    def test_one_expensive_cell_does_not_dominate(self):
        """The reason for a geometric rather than arithmetic mean of relatives."""
        prices = make_prices([
            ("2026-01-01", "cheap", 1000.0, 5),
            ("2026-01-01", "dear", 50000.0, 5),
            ("2026-01-02", "cheap", 1000.0, 5),
            ("2026-01-02", "dear", 55000.0, 5),
        ])
        weights = {"cheap": 0.5, "dear": 0.5}
        base = {"cheap": 1000.0, "dear": 50000.0}
        series = index_mod.compute_series(
            index_mod.IndexInputs(prices, weights, 0.0), base
        )
        # A ten per cent rise in half the basket is about a 4.9 per cent index rise, not
        # the 9.5 per cent an unweighted mean of levels would produce.
        assert series.iloc[1]["apix"] == pytest.approx(104.881, abs=0.01)

    def test_zero_and_negative_prices_are_excluded(self):
        prices = make_prices([
            ("2026-01-01", "A", 100.0, 5),
            ("2026-01-01", "B", 0.0, 0),
            ("2026-01-02", "A", 120.0, 5),
            ("2026-01-02", "B", -5.0, 0),
        ])
        weights = {"A": 0.5, "B": 0.5}
        series = index_mod.compute_series(
            index_mod.IndexInputs(prices, weights, 0.0), {"A": 100.0, "B": 100.0}
        )
        assert np.isfinite(series["apix"]).all()
        assert series.iloc[1]["apix"] == pytest.approx(120.0, abs=1e-6)

    def test_cell_without_base_price_is_excluded(self):
        prices = make_prices([
            ("2026-01-02", "A", 120.0, 5),
            ("2026-01-02", "NEW", 900.0, 5),
        ])
        series = index_mod.compute_series(
            index_mod.IndexInputs(prices, {"A": 0.5, "NEW": 0.5}, 0.0), {"A": 100.0}
        )
        assert series.iloc[0]["cells_used"] == 1


class TestCarryForward:
    def test_gap_uses_last_known_price_and_is_flagged(self):
        prices = make_prices([
            ("2026-01-01", "A", 100.0, 5),
            ("2026-01-02", "A", None, 0),
            ("2026-01-03", "A", 130.0, 5),
        ])
        filled = index_mod.carry_forward(prices)
        middle = filled[filled["date"] == dt.date(2026, 1, 2)].iloc[0]
        assert middle["price"] == 100.0
        assert bool(middle["imputed"]) is True

    def test_leading_gap_is_not_back_filled(self):
        """Inventing a price before any measurement is fabrication, not imputation."""
        prices = make_prices([
            ("2026-01-01", "A", None, 0),
            ("2026-01-02", "A", 100.0, 5),
        ])
        filled = index_mod.carry_forward(prices)
        first = filled[filled["date"] == dt.date(2026, 1, 1)].iloc[0]
        assert pd.isna(first["price"])
        assert bool(first["imputed"]) is False


class TestCoverage:
    def test_coverage_counts_only_fresh_cells(self):
        prices = make_prices([
            ("2026-01-01", "A", 100.0, 5),
            ("2026-01-01", "B", 100.0, 5),
            ("2026-01-02", "A", 110.0, 5),
            ("2026-01-02", "B", None, 0),
        ])
        weights = {"A": 0.5, "B": 0.5}
        series = index_mod.compute_series(
            index_mod.IndexInputs(prices, weights, 0.6), {"A": 100.0, "B": 100.0}
        )
        second = series.iloc[1]
        assert second["coverage"] == pytest.approx(0.5)
        assert second["imputed_cells"] == 1
        assert bool(second["published"]) is False

    def test_value_below_threshold_is_returned_unpublished_not_dropped(self):
        prices = make_prices([
            ("2026-01-01", "A", 100.0, 5),
            ("2026-01-01", "B", 100.0, 5),
            ("2026-01-02", "A", 110.0, 5),
            ("2026-01-02", "B", None, 0),
        ])
        series = index_mod.compute_series(
            index_mod.IndexInputs(prices, {"A": 0.5, "B": 0.5}, 0.9),
            {"A": 100.0, "B": 100.0},
        )
        assert len(series) == 2
        assert not bool(series.iloc[1]["published"])


class TestBaseWindow:
    def test_finds_first_consecutive_qualifying_run(self):
        rows = []
        for day in range(1, 8):
            date = f"2026-01-{day:02d}"
            # The first two days have only one of two cells present.
            rows.append((date, "A", 100.0, 5))
            if day >= 3:
                rows.append((date, "B", 100.0, 5))
        prices = make_prices(rows)
        window = index_mod.find_base_window(
            prices, {"A": 0.5, "B": 0.5}, days=3, min_coverage=0.9
        )
        assert window is not None
        assert window.start == dt.date(2026, 1, 3)
        assert window.end == dt.date(2026, 1, 5)

    def test_returns_none_when_history_is_too_short(self):
        prices = make_prices([("2026-01-01", "A", 100.0, 5)])
        assert index_mod.find_base_window(prices, {"A": 1.0}, days=3, min_coverage=0.5) is None

    def test_base_price_is_the_mean_over_the_window(self):
        prices = make_prices([
            ("2026-01-01", "A", 100.0, 5),
            ("2026-01-02", "A", 200.0, 5),
            ("2026-01-03", "A", 300.0, 5),
        ])
        window = index_mod.BaseWindow(dt.date(2026, 1, 1), dt.date(2026, 1, 3), 3)
        assert index_mod.compute_base_prices(prices, window)["A"] == pytest.approx(200.0)


class TestChanges:
    def test_changes_use_calendar_lags_not_row_offsets(self):
        rows = []
        for day in range(1, 16):
            if day == 5:
                continue  # a missing publication day
            rows.append((f"2026-01-{day:02d}", "A", 100.0 + day, 5))
        prices = make_prices(rows)
        series = index_mod.compute_series(
            index_mod.IndexInputs(prices, {"A": 1.0}, 0.0), {"A": 100.0}
        )
        with_changes = index_mod.add_changes(series)
        row = with_changes[with_changes["date"] == dt.date(2026, 1, 15)].iloc[0]
        previous = with_changes[with_changes["date"] == dt.date(2026, 1, 8)].iloc[0]
        expected = (row["apix"] / previous["apix"] - 1) * 100
        assert row["wow_pct"] == pytest.approx(expected, abs=1e-4)


class TestWeights:
    def test_normalise_drops_non_positive_and_sums_to_one(self):
        result = index_mod.normalise_weights({"A": 2.0, "B": 2.0, "C": 0.0, "D": -1.0})
        assert set(result) == {"A", "B"}
        assert sum(result.values()) == pytest.approx(1.0)

    def test_empty_weights_return_empty(self):
        assert index_mod.normalise_weights({"A": 0.0}) == {}


class TestContributions:
    def test_contributions_identify_the_mover(self):
        prices = make_prices([
            ("2026-01-01", "A", 100.0, 5),
            ("2026-01-01", "B", 100.0, 5),
            ("2026-01-08", "A", 150.0, 5),
            ("2026-01-08", "B", 100.0, 5),
        ])
        frame = index_mod.contribution_analysis(
            prices, {"A": 0.5, "B": 0.5}, {"A": 100.0, "B": 100.0},
            dt.date(2026, 1, 8), dt.date(2026, 1, 1),
        )
        assert frame.iloc[0]["cell"] == "A"
        assert frame.iloc[0]["pct_change"] == pytest.approx(50.0)
