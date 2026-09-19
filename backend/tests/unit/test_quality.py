"""Tests for normalisation, validation and the outlier rule."""

from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd
import pytest

from engine import cells as cells_mod
from engine import normalise as normalise_mod
from engine import quality as quality_mod

LEAD_TIMES = [1, 7, 15, 30, 45]


def base_frame(rows: list[dict]) -> pd.DataFrame:
    defaults = {
        "currency": "INR", "cabin": "economy", "lead_time_days": 15,
        "base_fare": 0.0, "taxes": 0.0, "udf": 0.0, "convenience_fee": 0.0,
        "components_were_split": True,
    }
    return pd.DataFrame([{**defaults, **row} for row in rows])


def validate(frame: pd.DataFrame) -> pd.DataFrame:
    return quality_mod.validate_fares(
        frame, min_fare=500, max_fare=100000, max_lead_time_days=60, lead_times=LEAD_TIMES
    )


class TestMoneyParsing:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            (5120, 5120.0),
            ("5120", 5120.0),
            ("₹5,120", 5120.0),
            ("INR 5 120.00", 5120.0),
            ("5,120.50", 5120.5),
            ("", None),
            (None, None),
            ("sold out", None),
            ("Call us", None),
        ],
    )
    def test_parse_money(self, raw, expected):
        assert normalise_mod.parse_money(raw) == expected

    def test_zero_is_parsed_not_dropped(self):
        """Zero must reach the validator so it can be rejected and counted."""
        assert normalise_mod.parse_money(0) == 0.0
        assert normalise_mod.parse_money("0") == 0.0


class TestAirlineNormalisation:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("IndiGo", "6E"), ("indigo", "6E"), ("6E", "6E"),
            ("Air India", "AI"), ("AIR INDIA", "AI"),
            ("Akasa Air", "QP"), ("SpiceJet", "SG"),
            ("IndiGo 6E-2034", "6E"),
            ("", None), (None, None), ("Some Unknown Carrier", None),
        ],
    )
    def test_normalise_airline(self, raw, expected):
        assert normalise_mod.normalise_airline(raw) == expected


class TestComponentSplit:
    def test_itemised_components_are_kept(self):
        base, taxes, udf, conv, split = normalise_mod.split_components(
            5000.0, base=4000.0, taxes=700.0, udf=200.0, convenience=100.0
        )
        assert (base, taxes, udf, conv) == (4000.0, 700.0, 200.0, 100.0)
        assert split is True

    def test_drift_is_absorbed_into_taxes_not_the_base_fare(self):
        base, taxes, _, _, _ = normalise_mod.split_components(
            5000.0, base=4000.0, taxes=600.0, udf=200.0, convenience=0.0
        )
        assert base == 4000.0
        assert taxes == pytest.approx(800.0)

    def test_single_price_is_apportioned_and_flagged(self):
        base, taxes, udf, conv, split = normalise_mod.split_components(10000.0)
        assert split is False
        assert base + taxes + udf + conv == pytest.approx(10000.0, abs=0.01)


class TestValidation:
    def test_clean_fare_passes(self):
        frame = validate(base_frame([
            {"total_fare": 5000.0, "base_fare": 4000.0, "taxes": 800.0, "udf": 200.0}
        ]))
        assert bool(frame.iloc[0]["is_valid"]) is True
        assert frame.iloc[0]["quality_flags"] == []

    def test_non_inr_is_rejected(self):
        frame = validate(base_frame([{"total_fare": 80.0, "currency": "USD"}]))
        assert quality_mod.FLAG_NON_INR in frame.iloc[0]["quality_flags"]
        assert bool(frame.iloc[0]["is_valid"]) is False

    def test_zero_fare_is_rejected(self):
        frame = validate(base_frame([{"total_fare": 0.0}]))
        assert quality_mod.FLAG_NON_POSITIVE in frame.iloc[0]["quality_flags"]

    def test_implausible_extremes_are_rejected(self):
        frame = validate(base_frame([
            {"total_fare": 120.0, "base_fare": 120.0},
            {"total_fare": 250000.0, "base_fare": 250000.0},
        ]))
        assert quality_mod.FLAG_BELOW_FLOOR in frame.iloc[0]["quality_flags"]
        assert quality_mod.FLAG_ABOVE_CEILING in frame.iloc[1]["quality_flags"]

    def test_lead_time_outside_the_basket_is_rejected(self):
        frame = validate(base_frame([{"total_fare": 5000.0, "lead_time_days": 9}]))
        assert quality_mod.FLAG_BAD_LEAD_TIME in frame.iloc[0]["quality_flags"]

    def test_non_economy_is_rejected(self):
        frame = validate(base_frame([{"total_fare": 25000.0, "cabin": "business"}]))
        assert quality_mod.FLAG_NON_ECONOMY in frame.iloc[0]["quality_flags"]

    def test_components_not_summing_is_flagged_but_not_rejecting(self):
        frame = validate(base_frame([
            {"total_fare": 5000.0, "base_fare": 1000.0, "taxes": 100.0}
        ]))
        flags = frame.iloc[0]["quality_flags"]
        assert quality_mod.FLAG_COMPONENTS_MISMATCH in flags
        # Advisory, not rejecting: the index prices the total, not the split.
        assert bool(frame.iloc[0]["is_valid"]) is True

    def test_empty_frame_is_handled(self):
        result = validate(pd.DataFrame(columns=[
            "total_fare", "currency", "lead_time_days", "cabin",
            "base_fare", "taxes", "udf", "convenience_fee",
        ]))
        assert result.empty


class TestOutliers:
    def test_modified_z_scores_flag_the_extreme_value(self):
        values = np.array([5000, 5100, 4950, 5050, 5020, 50000], dtype=float)
        scores = quality_mod.modified_z_scores(values)
        assert abs(scores[-1]) > 3.5
        assert all(abs(s) < 3.5 for s in scores[:-1])

    def test_logarithms_catch_the_cheap_tail_too(self):
        values = np.array([5000, 5100, 4950, 5050, 5020, 300], dtype=float)
        scores = quality_mod.modified_z_scores(values)
        assert abs(scores[-1]) > 3.5

    def test_identical_values_produce_no_outliers(self):
        scores = quality_mod.modified_z_scores(np.array([5000.0] * 6))
        assert np.allclose(scores, 0.0)

    def test_small_cells_are_left_alone(self):
        """With three observations the dispersion estimate is meaningless."""
        frame = base_frame([
            {"total_fare": 5000.0, "observation_date": dt.date(2026, 1, 1), "route_id": 1},
            {"total_fare": 5100.0, "observation_date": dt.date(2026, 1, 1), "route_id": 1},
            {"total_fare": 90000.0, "observation_date": dt.date(2026, 1, 1), "route_id": 1},
        ])
        frame["is_valid"] = True
        frame["quality_flags"] = [[] for _ in range(len(frame))]
        result = quality_mod.flag_outliers(frame, threshold=3.5, min_group_size=4)
        assert all(quality_mod.FLAG_OUTLIER_MAD not in f for f in result["quality_flags"])

    def test_outlier_is_flagged_and_invalidated_in_a_large_cell(self):
        rows = [
            {"total_fare": price, "observation_date": dt.date(2026, 1, 1), "route_id": 1}
            for price in (5000, 5100, 4950, 5050, 5020, 60000)
        ]
        frame = base_frame(rows)
        frame["is_valid"] = True
        frame["quality_flags"] = [[] for _ in range(len(frame))]
        result = quality_mod.flag_outliers(frame, threshold=3.5)
        assert quality_mod.FLAG_OUTLIER_MAD in result.iloc[-1]["quality_flags"]
        assert bool(result.iloc[-1]["is_valid"]) is False
        assert bool(result.iloc[0]["is_valid"]) is True


class TestCells:
    def make(self, rows):
        frame = base_frame(rows)
        frame["quality_flags"] = [[] for _ in range(len(frame))]
        return frame

    def test_minimum_logical_fare_is_the_cheapest_valid_fare(self):
        frame = self.make([
            {"total_fare": 5000.0, "observation_date": dt.date(2026, 1, 1),
             "route_id": 1, "airline_code": "6E", "is_valid": True},
            {"total_fare": 4200.0, "observation_date": dt.date(2026, 1, 1),
             "route_id": 1, "airline_code": "AI", "is_valid": True},
            {"total_fare": 100.0, "observation_date": dt.date(2026, 1, 1),
             "route_id": 1, "airline_code": "SG", "is_valid": False},
        ])
        result = cells_mod.build_cells(frame)
        assert result.iloc[0]["min_logical_fare"] == 4200.0
        assert result.iloc[0]["obs_count"] == 2

    def test_cell_with_no_valid_fares_survives_with_zero_count(self):
        frame = self.make([
            {"total_fare": 0.0, "observation_date": dt.date(2026, 1, 1),
             "route_id": 1, "airline_code": "6E", "is_valid": False},
        ])
        result = cells_mod.build_cells(frame)
        assert len(result) == 1
        assert result.iloc[0]["obs_count"] == 0
        assert result.iloc[0]["min_logical_fare"] is None

    def test_thin_cells_lose_their_price_but_keep_their_row(self):
        frame = self.make([
            {"total_fare": 5000.0, "observation_date": dt.date(2026, 1, 1),
             "route_id": 1, "airline_code": "6E", "is_valid": True},
        ])
        result = cells_mod.apply_min_observations(cells_mod.build_cells(frame), min_obs=3)
        assert len(result) == 1
        # Pandas represents the blanked price as NaN. The pipeline converts it to NULL
        # before it reaches the database, because NaN is not valid JSON.
        assert pd.isna(result.iloc[0]["min_logical_fare"])
        assert result.iloc[0]["obs_count"] == 1
