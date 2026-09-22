"""Engine and session management."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

import os
import shutil
from pathlib import Path

from app.core.config import get_settings
from app.db.models import Base

_settings = get_settings()

# On ephemeral serverless platforms (like Vercel /tmp) or fresh setups,
# automatically hydrate from seed.db if the database doesn't exist yet.
if _settings.is_sqlite:
    try:
        db_path_str = _settings.database_url.replace("sqlite:///", "")
        db_file = Path(db_path_str)
        seed_file = Path(__file__).resolve().parent / "seed.db"
        if seed_file.exists() and (not db_file.exists() or db_file.stat().st_size < 100_000):
            db_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(seed_file, db_file)
    except Exception:
        pass

_connect_args = {"check_same_thread": False} if _settings.is_sqlite else {}

engine: Engine = create_engine(
    _settings.database_url,
    echo=False,
    future=True,
    pool_pre_ping=not _settings.is_sqlite,
    connect_args=_connect_args,
)

if _settings.is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record):  # type: ignore[no-untyped-def]
        # Write-ahead logging so the collector can write while the API reads, and
        # foreign keys on, which SQLite disables by default.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    """Create every table that does not yet exist.

    Deliberate deviation from the plan: the project uses metadata creation rather than
    Alembic migrations. The schema has no production history to migrate and a single
    creation path is one less thing to break during a demonstration. Adding Alembic
    later is mechanical, because the models are already the single source of truth.
    """
    Base.metadata.create_all(bind=engine)


def drop_db() -> None:
    Base.metadata.drop_all(bind=engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope for scripts and the collector."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
