"""Tests for the analytical layer: formulas, trust, forecasting and scenarios.

These modules make claims about their own limitations. The tests below check that those
claims are enforced in code rather than only written in docstrings, because a caveat that
the code does not honour is worse than no caveat.
"""

from __future__ import annotations

import datetime as dt

import numpy as np
import pytest

from engine import forecast as forecast_mod
from engine import formulas as formulas_mod
from engine import scenario as scenario_mod
from engine import trust as trust_mod


class TestFormulas:
    def test_no_change_gives_one_hundred_everywhere(self):
        prices = np.array([100.0, 200.0, 300.0])
        weights = np.array([0.3, 0.3, 0.4])
        result = formulas_mod.compare_formulas(prices, prices, weights)
        for entry in result.results:
            assert entry.value == pytest.approx(100.0, abs=1e-6)

    def test_fixed_quantities_make_laspeyres_and_paasche_identical(self):
        """The degenerate case the module warns about, asserted rather than assumed."""
        p0 = np.array([100.0, 200.0])
        pt = np.array([150.0, 180.0])
        weights = np.array([0.5, 0.5])
        result = formulas_mod.compare_formulas(
            p0, pt, weights, mode=formulas_mod.QuantityMode.FIXED
        )
        values = {r.name: r.value for r in result.results}
        assert values["laspeyres"] == pytest.approx(values["paasche"], abs=1e-9)
        assert values["fisher"] == pytest.approx(values["laspeyres"], abs=1e-9)
        assert any("equal by construction" in note for note in result.notes)

    def test_elasticity_mode_separates_laspeyres_and_paasche(self):
        p0 = np.array([100.0, 200.0])
        pt = np.array([150.0, 180.0])
        weights = np.array([0.5, 0.5])
        result = formulas_mod.compare_formulas(
            p0, pt, weights, mode=formulas_mod.QuantityMode.ELASTICITY_MODEL, elasticity=1.2
        )
        values = {r.name: r.value for r in result.results}
        assert values["laspeyres"] != pytest.approx(values["paasche"], abs=1e-6)
        assert result.elasticity == 1.2

    def test_carli_exceeds_jevons_on_dispersed_relatives(self):
        """The known upward bias, which is why Carli is shown but not used."""
        p0 = np.array([100.0, 100.0])
        pt = np.array([50.0, 200.0])
        weights = np.array([0.5, 0.5])
        result = formulas_mod.compare_formulas(p0, pt, weights)
        values = {r.name: r.value for r in result.results}
        assert values["carli"] > values["jevons"]
        assert values["jevons"] == pytest.approx(100.0, abs=1e-6)
        assert values["carli"] == pytest.approx(125.0, abs=1e-6)

    def test_fisher_lies_between_laspeyres_and_paasche(self):
        p0 = np.array([100.0, 200.0, 50.0])
        pt = np.array([130.0, 180.0, 70.0])
        weights = np.array([0.4, 0.4, 0.2])
        result = formulas_mod.compare_formulas(
            p0, pt, weights, mode=formulas_mod.QuantityMode.ELASTICITY_MODEL
        )
        values = {r.name: r.value for r in result.results}
        low, high = sorted([values["laspeyres"], values["paasche"]])
        assert low <= values["fisher"] <= high

    def test_empty_input_is_reported_not_crashed(self):
        result = formulas_mod.compare_formulas(
            np.array([]), np.array([]), np.array([])
        )
        assert result.results == []
        assert result.notes


class TestTrust:
    def test_synthetic_provenance_caps_the_score(self):
        report = trust_mod.build_report(
            latest_observation=dt.datetime.now(),
            now=dt.datetime.now(),
            coverage=1.0,
            coverage_threshold=0.6,
            obs_per_cell=20.0,
            source_kinds={"synthetic": 1000},
            cell_spreads=None,
        )
        # Perfect on everything measurable except provenance, which is capped at ten.
        assert report.overall is not None
        assert report.overall < 80
        assert any("synthetic" in w.lower() for w in report.warnings)

    def test_licensed_feed_scores_well(self):
        report = trust_mod.build_report(
            latest_observation=dt.datetime.now(),
            now=dt.datetime.now(),
            coverage=1.0,
            coverage_threshold=0.6,
            obs_per_cell=20.0,
            source_kinds={"feed": 1000},
            cell_spreads=[0.02, 0.03],
        )
        assert report.overall is not None
        assert report.overall >= 85
        assert report.band == "publishable"

    def test_single_source_leaves_consensus_unmeasured(self):
        report = trust_mod.build_report(
            latest_observation=dt.datetime.now(), now=dt.datetime.now(),
            coverage=1.0, coverage_threshold=0.6, obs_per_cell=10.0,
            source_kinds={"feed": 10}, cell_spreads=[],
        )
        consensus = next(c for c in report.components if c.name == "consensus")
        assert consensus.score is None
        assert consensus.measured is False
        assert any("consensus" in w for w in report.warnings)

    def test_unmeasured_components_are_excluded_not_defaulted(self):
        """An unmeasurable component must not silently score zero or full marks."""
        with_consensus = trust_mod.build_report(
            latest_observation=dt.datetime.now(), now=dt.datetime.now(),
            coverage=1.0, coverage_threshold=0.6, obs_per_cell=10.0,
            source_kinds={"feed": 10}, cell_spreads=[0.02],
        )
        without = trust_mod.build_report(
            latest_observation=dt.datetime.now(), now=dt.datetime.now(),
            coverage=1.0, coverage_threshold=0.6, obs_per_cell=10.0,
            source_kinds={"feed": 10}, cell_spreads=[],
        )
        # Both near the top; the missing component does not drag the score to zero.
        assert without.overall is not None and with_consensus.overall is not None
        assert abs(without.overall - with_consensus.overall) < 6

    def test_stale_data_lowers_freshness(self):
        now = dt.datetime(2026, 9, 19, 12, 0)
        report = trust_mod.build_report(
            latest_observation=now - dt.timedelta(days=5), now=now,
            coverage=1.0, coverage_threshold=0.6, obs_per_cell=10.0,
            source_kinds={"feed": 10}, cell_spreads=None,
        )
        freshness = next(c for c in report.components if c.name == "freshness")
        assert freshness.score == 0.0


class TestForecast:
    def make_series(self, days: int = 60, trend: float = 0.05):
        start = dt.date(2026, 1, 1)
        dates = [start + dt.timedelta(days=i) for i in range(days)]
        values = [
            100.0 + trend * i + 2.0 * np.sin(2 * np.pi * i / 7) for i in range(days)
        ]
        return dates, values

    def test_short_history_refuses_rather_than_guesses(self):
        dates, values = self.make_series(days=10)
        result = forecast_mod.forecast(dates, values)
        assert result.points == []
        assert any("observations" in n for n in result.notes)

    def test_produces_the_requested_horizon(self):
        dates, values = self.make_series()
        result = forecast_mod.forecast(dates, values, horizon=14)
        assert len(result.points) == 14
        assert result.points[0].date == dates[-1] + dt.timedelta(days=1)

    def test_every_model_is_scored_out_of_sample(self):
        dates, values = self.make_series()
        result = forecast_mod.forecast(dates, values)
        assert result.holdout_days > 0
        assert {s.name for s in result.scores} <= set(forecast_mod.MODELS)
        assert all(s.rmse >= 0 for s in result.scores)
        assert sum(s.weight for s in result.scores) == pytest.approx(1.0, abs=1e-6)

    def test_intervals_widen_with_the_horizon(self):
        dates, values = self.make_series()
        result = forecast_mod.forecast(dates, values, horizon=14)
        first = result.points[0].upper - result.points[0].lower
        last = result.points[-1].upper - result.points[-1].lower
        assert last > first

    def test_seasonal_naive_repeats_the_last_week(self):
        history = np.array([1.0, 2, 3, 4, 5, 6, 7], dtype=float)
        projection = forecast_mod.seasonal_naive(history, 9)
        assert list(projection[:7]) == [1, 2, 3, 4, 5, 6, 7]
        assert projection[7] == 1.0

    def test_notes_state_the_limits(self):
        dates, values = self.make_series()
        result = forecast_mod.forecast(dates, values)
        joined = " ".join(result.notes).lower()
        assert "holdout" in joined
        assert "extrapolation" in joined or "cannot see" in joined


class TestScenario:
    POLICY = {
        "fuel": {"atf_cost_share": 0.4, "pass_through": 0.5, "pass_through_lag_days": 40},
        "demand": {"demand_to_fare": 0.5, "own_price_elasticity": 1.2},
        "capacity": {"capacity_to_fare": -0.5},
        "cpi": {"airfare_weight_pct": 0.2, "weight_is_official": False},
        "bounds": {
            "max_airfare_shock_pct": 50, "max_atf_shock_pct": 60,
            "max_demand_shock_pct": 40, "max_capacity_shock_pct": 30,
            "max_horizon_days": 180,
        },
    }

    def run(self, **kwargs):
        return scenario_mod.simulate(
            scenario_mod.ScenarioInput(**kwargs),
            self.POLICY,
            baseline_index=100.0,
            baseline_date=dt.date(2026, 9, 19),
        )

    def test_no_shock_means_no_effect(self):
        result = self.run()
        assert result.total_fare_effect_pct == 0.0
        assert result.channels == []

    def test_fuel_channel_arithmetic(self):
        # 20% fuel move, 40% cost share, 50% pass-through = 4%.
        result = self.run(atf_shock_pct=20.0)
        assert result.total_fare_effect_pct == pytest.approx(4.0)

    def test_channels_add(self):
        result = self.run(airfare_shock_pct=2.0, demand_shock_pct=10.0)
        assert result.total_fare_effect_pct == pytest.approx(2.0 + 5.0)

    def test_capacity_increase_lowers_fares(self):
        result = self.run(capacity_shock_pct=10.0)
        assert result.total_fare_effect_pct < 0

    def test_out_of_bounds_shock_is_refused(self):
        with pytest.raises(scenario_mod.ScenarioError) as exc:
            self.run(atf_shock_pct=200.0)
        assert "outside the supported range" in str(exc.value)

    def test_unofficial_cpi_weight_produces_a_warning(self):
        result = self.run(airfare_shock_pct=10.0)
        assert result.cpi_effect_is_official is False
        assert any("placeholder" in w for w in result.warnings)

    def test_fuel_effect_ramps_over_the_lag(self):
        result = self.run(atf_shock_pct=20.0, horizon_days=80)
        assert result.path[0].delta_pct == pytest.approx(0.0, abs=1e-9)
        assert result.path[-1].delta_pct == pytest.approx(4.0, abs=1e-6)

    def test_assumptions_are_always_returned(self):
        result = self.run(atf_shock_pct=5.0)
        assert result.assumptions["all_values_are_stated_priors"] is True
        assert "source_file" in result.assumptions

    def test_sensitivity_ranks_the_dominant_assumption(self):
        rows = scenario_mod.sensitivity(
            scenario_mod.ScenarioInput(atf_shock_pct=20.0),
            self.POLICY, baseline_index=100.0, baseline_date=dt.date(2026, 9, 19),
        )
        assert rows
        assert rows[0]["assumption"].startswith("fuel.")


class TestAnomalies:
    def test_detects_a_jump(self):
        dates = [dt.date(2026, 1, 1) + dt.timedelta(days=i) for i in range(30)]
        values = [100.0 + 0.1 * i for i in range(30)]
        values[20] = 140.0
        found = scenario_mod.detect_series_anomalies(dates, values)
        flagged = {row["date"] for row in found}
        assert dates[20].isoformat() in flagged

    def test_smooth_series_has_no_anomalies(self):
        dates = [dt.date(2026, 1, 1) + dt.timedelta(days=i) for i in range(30)]
        values = [100.0 + 0.1 * i for i in range(30)]
        assert scenario_mod.detect_series_anomalies(dates, values) == []

    def test_short_series_returns_nothing(self):
        dates = [dt.date(2026, 1, 1) + dt.timedelta(days=i) for i in range(5)]
        assert scenario_mod.detect_series_anomalies(dates, [100.0] * 5) == []


class TestAnalyst:
    def test_deterministic_answering_without_model(self):
        from engine import analyst as analyst_mod

        evidence = analyst_mod.Evidence()
        evidence.add("latest_index", {"date": "2026-09-19", "apix": 105.5, "coverage": 1.0})
        ans = analyst_mod.answer("What is the airfare index today?", evidence, prefer_model=False)
        assert ans.mode == "deterministic"
        assert "105.5" in ans.answer

    def test_analyst_model_name_is_valid(self):
        from engine import analyst as analyst_mod

        assert "claude" in analyst_mod.MODEL
        assert analyst_mod.MODEL != "claude-opus-5"

