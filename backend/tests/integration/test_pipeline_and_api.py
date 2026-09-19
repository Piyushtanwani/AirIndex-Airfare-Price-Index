"""End-to-end tests.

These run the real collector against the synthetic source, the real pipeline, and the
real API, on a throwaway database. If this file passes, a clean clone of the project
produces a working index.
"""

from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import func, select


class TestPipeline:
    def test_pipeline_produces_an_index(self, populated):
        assert populated.observations_read > 0
        assert populated.fares_written > 0
        assert populated.cells_written > 0
        assert populated.index_values_written > 0
        assert populated.base_window is not None

    def test_quality_rules_actually_reject_something(self, populated):
        """The synthetic source injects malformed fares on purpose.

        If nothing is ever rejected, the validation path is untested in practice, and a
        pipeline whose quality rules never fire is not a tested pipeline.
        """
        assert populated.fares_rejected > 0

    def test_every_index_value_carries_its_methodology_version(self, session):
        from app.db.models import IndexValue

        missing = session.scalar(
            select(func.count()).select_from(IndexValue).where(
                IndexValue.methodology_version.is_(None)
            )
        )
        assert missing == 0

    def test_route_weights_are_normalised_and_sourced(self, session):
        from app.db.models import Route

        routes = session.scalars(select(Route).where(Route.active.is_(True))).all()
        assert routes
        assert sum(r.weight for r in routes) == pytest.approx(1.0, abs=1e-6)
        assert all(r.weight_source and r.weight_source != "unset" for r in routes)
        # The shipped weights are a declared proxy, not official figures.
        assert all(r.weight_is_official is False for r in routes)

    def test_reprocessing_is_idempotent(self, session, populated):
        from engine.pipeline import process_observations

        report = process_observations(session)
        assert report.fares_written == 0

    def test_duplicate_observations_are_rejected_by_the_database(self, populated):
        """Running the collector twice for the same instant must add nothing."""
        from app.db.models import RawObservation
        from app.db.session import session_scope
        from collector.runner import Collector

        when = dt.datetime.combine(dt.date.today(), dt.time(2, 30))
        with session_scope() as db:
            before = db.scalar(select(func.count()).select_from(RawObservation))
            Collector(db).run(captured_at=when, source_codes=["synthetic"], pace=False)
            middle = db.scalar(select(func.count()).select_from(RawObservation))
            summaries = Collector(db).run(
                captured_at=when, source_codes=["synthetic"], pace=False
            )
            after = db.scalar(select(func.count()).select_from(RawObservation))

        assert after == middle
        assert summaries[0].duplicates > 0
        assert middle >= before

    def test_a_crawl_run_is_recorded_even_for_a_blocked_source(self, session):
        """A source that cannot collect must still leave a trace."""
        from app.db.models import CrawlRun, Source
        from collector.runner import Collector

        collector = Collector(session)
        source = Source(code="blocked-test", name="Blocked", kind="ota",
                        base_url="https://example.invalid", enabled=True)
        session.add(source)
        session.flush()

        before = session.scalar(select(func.count()).select_from(CrawlRun))

        class Blocked:
            code = "blocked-test"
            name = "Blocked"
            kind = "ota"
            base_url = "https://example.invalid"
            tos_url = None
            requires_robots_check = True

            def describe(self):
                return {"code": self.code, "name": self.name, "kind": self.kind,
                        "base_url": self.base_url, "tos_url": None,
                        "requires_robots_check": True}

            def prepare(self): ...
            def teardown(self): ...
            def fetch(self, *args, **kwargs):  # pragma: no cover - never reached
                raise AssertionError("fetch must not run for a blocked source")

        summary = collector._run_one(Blocked(), [], {}, dt.datetime.now(), pace=False)  # noqa: SLF001
        after = session.scalar(select(func.count()).select_from(CrawlRun))

        assert after == before + 1
        assert summary.status in {"blocked_by_robots", "failed"}


class TestRobotsGate:
    def test_unreachable_robots_fails_closed(self):
        from collector.robots import RobotsGate

        gate = RobotsGate(user_agent="AirIndexTest/1.0", timeout=0.001)
        decision = gate.check("https://this-host-does-not-exist.invalid/search")
        assert decision.allowed is False
        assert "failing closed" in decision.reason

    def test_invalid_url_is_refused(self):
        from collector.robots import RobotsGate

        gate = RobotsGate(user_agent="AirIndexTest/1.0")
        assert gate.check("not-a-url").allowed is False


class TestLiveAdapterGating:
    def test_live_adapters_are_excluded_unless_explicitly_enabled(self):
        from collector.runner import resolve_adapters

        adapters = resolve_adapters(["indigo", "makemytrip", "synthetic"])
        codes = {a.code for a in adapters}
        assert codes == {"synthetic"}

    def test_unknown_source_is_ignored_not_fatal(self):
        from collector.runner import resolve_adapters

        assert resolve_adapters(["nonsense"]) == []


class TestApi:
    def test_health(self, client):
        response = client.get("/v1/health")
        assert response.status_code == 200
        assert response.json()["database"] == "ok"

    def test_methodology_is_served_from_configuration(self, client):
        payload = client.get("/v1/methodology").json()
        assert payload["index_type"].startswith("Weighted Jevons")
        assert payload["weights_are_official"] is False
        assert payload["known_limitations"]

    def test_routes_carry_weights_and_provenance(self, client):
        payload = client.get("/v1/routes").json()
        assert payload["count"] == 15
        first = payload["items"][0]
        assert first["weight"] > 0
        assert first["weight_source"]

    def test_index_series_is_returned_in_date_order(self, client):
        payload = client.get("/v1/index?scope=national").json()
        dates = [item["date"] for item in payload["items"]]
        assert dates == sorted(dates)
        assert payload["items"][0]["apix"] > 0

    def test_latest_index_has_movers(self, client):
        payload = client.get("/v1/index/latest").json()
        assert payload["item"] is not None
        assert isinstance(payload["top_movers"], list)

    def test_window_filter(self, client):
        payload = client.get("/v1/index?scope=national&window=T%2B15").json()
        assert payload["window"] == "T+15"

    def test_invalid_window_is_a_client_error(self, client):
        assert client.get("/v1/index?window=T%2B9").status_code == 400

    def test_unknown_route_is_not_found(self, client):
        assert client.get("/v1/index?scope=route&route=XXX-YYY").status_code == 404

    def test_route_scope_requires_a_route(self, client):
        assert client.get("/v1/index?scope=route").status_code == 400

    def test_heatmap(self, client):
        payload = client.get("/v1/index/heatmap?route=DEL-BOM&days=10").json()
        assert payload["route"] == "DEL-BOM"
        assert payload["lead_times"] == [1, 7, 15, 30, 45]
        assert payload["cells"]

    def test_fares_are_paginated(self, client):
        payload = client.get("/v1/fares?page_size=5").json()
        assert len(payload["items"]) <= 5
        assert payload["total"] > 5

    def test_quality_summary_reports_rejections(self, client):
        payload = client.get("/v1/quality/summary").json()
        assert payload["totals"]["valid_fares"] > 0
        assert payload["totals"]["validation_pass_rate"] <= 1.0
        assert payload["sources"]
        assert payload["sources"][0]["code"] == "synthetic"

    def test_csv_export(self, client):
        response = client.get("/v1/export.csv?scope=national")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/csv")
        lines = response.text.strip().splitlines()
        assert lines[0].startswith("date,scope,scope_id,window,apix")
        assert len(lines) > 1

    def test_admin_requires_a_key(self, client):
        assert client.post("/v1/admin/recompute", json={}).status_code == 403

    def test_shipped_development_key_is_refused_outside_development(self, client):
        """The default key in settings must never work in a deployed environment."""
        response = client.post(
            "/v1/admin/recompute",
            json={},
            headers={"X-API-Key": "dev-admin-key-change-me"},
        )
        assert response.status_code == 401
        assert "development key is refused" in response.json()["detail"]

    def test_admin_accepts_the_configured_key(self, client):
        response = client.post(
            "/v1/admin/recompute",
            json={"reprocess": False},
            headers={"X-API-Key": "test-admin-key-a1b2c3"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_every_response_carries_the_methodology_version_header(self, client):
        response = client.get("/v1/index/latest")
        assert response.headers["X-Methodology-Version"]


class TestAnalyticsApi:
    def test_trust_is_capped_for_synthetic_data(self, client):
        payload = client.get("/v1/analytics/trust").json()
        assert payload["overall"] is not None
        assert payload["band"] != "publishable"
        assert any("synthetic" in w.lower() for w in payload["warnings"])

    def test_formulas_return_every_method(self, client):
        payload = client.get("/v1/analytics/formulas?lag_days=7").json()
        names = {r["name"] for r in payload["results"]}
        assert {"jevons", "laspeyres", "paasche", "fisher", "tornqvist", "walsh"} <= names
        assert payload["headline"] == "jevons"

    def test_anomalies_endpoint_responds(self, client):
        payload = client.get("/v1/analytics/anomalies").json()
        assert "items" in payload
        assert payload["note"]

    def test_scenario_arithmetic_and_warnings(self, client):
        response = client.post(
            "/v1/analytics/scenario",
            json={"atf_shock_pct": 10.0, "horizon_days": 30},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["total_fare_effect_pct"] > 0
        assert payload["cpi_effect_is_official"] is False
        assert payload["assumptions"]["all_values_are_stated_priors"] is True

    def test_scenario_refuses_an_extreme_shock(self, client):
        response = client.post(
            "/v1/analytics/scenario", json={"atf_shock_pct": 500.0}
        )
        assert response.status_code == 400
        assert "outside the supported range" in response.json()["detail"]

    def test_analyst_is_grounded_and_flags_synthetic_data(self, client):
        response = client.post(
            "/v1/analytics/ask",
            json={"question": "What is the airfare index today?", "use_model": False},
        )
        payload = response.json()
        assert payload["mode"] == "deterministic"
        assert "synthetic" in payload["answer"].lower()
        assert "latest_index" in payload["evidence"]

    def test_analyst_refuses_booking_advice(self, client):
        payload = client.post(
            "/v1/analytics/ask",
            json={"question": "Should I book my flight now?", "use_model": False},
        ).json()
        assert "not a booking tool" in payload["answer"].lower()

    def test_backtest_states_it_has_no_external_reference(self, client):
        payload = client.get("/v1/backtest?kind=stability&days=10").json()
        assert any("external reference" in note for note in payload["notes"])

    def test_leave_one_out_measures_route_influence(self, client):
        payload = client.get("/v1/backtest?kind=leave_one_out").json()
        assert payload["metrics"]["routes_tested"] > 0
        assert payload["series"]
