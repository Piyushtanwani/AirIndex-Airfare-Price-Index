"""Shared test fixtures.

Every test runs against a throwaway SQLite database in a temporary directory. The
environment variable is set before any application module is imported, because settings
are cached on first use and a test that quietly ran against the developer's real database
would be worse than no test.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

_TEMP_DIR = tempfile.mkdtemp(prefix="airindex-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TEMP_DIR).as_posix()}/test.db"
os.environ["ENVIRONMENT"] = "test"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["API_KEY_REQUIRED"] = "false"
os.environ["SCHEDULER_ENABLED"] = "false"

# A test-only administrative key. The key shipped in settings is deliberately refused
# outside a development environment, and this suite runs as "test", so it needs its own.
TEST_ADMIN_KEY = "test-admin-key-a1b2c3"
os.environ["ADMIN_API_KEY"] = TEST_ADMIN_KEY


@pytest.fixture(scope="session")
def database():
    from app.db.session import drop_db, init_db

    drop_db()
    init_db()
    yield
    drop_db()


@pytest.fixture
def session(database):
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        yield db
        db.rollback()
    finally:
        db.close()


@pytest.fixture(scope="session")
def populated(database):
    """A small but complete pipeline run: twenty days of synthetic observations.

    Twenty days rather than ninety, so the suite stays fast, and still enough for a base
    period, a week-on-week change and a coverage measurement.
    """
    import datetime as dt

    from app.db.session import session_scope
    from collector.runner import Collector
    from engine.pipeline import run_full_pipeline

    today = dt.date.today()
    for offset in range(20, 0, -1):
        when = dt.datetime.combine(today - dt.timedelta(days=offset - 1), dt.time(2, 30))
        with session_scope() as db:
            Collector(db).run(captured_at=when, source_codes=["synthetic"], pace=False)

    with session_scope() as db:
        report = run_full_pipeline(db)
    return report


@pytest.fixture
def client(populated):
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
