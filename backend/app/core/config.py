"""Runtime configuration.

Settings come from environment variables, optionally via a .env file at the repository
root. The three YAML files in backend/config are loaded here too and cached, because
they are configuration rather than data: routes, weights and methodology.
"""

from __future__ import annotations

import functools
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

import yaml
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent
CONFIG_DIR = BACKEND_DIR / "config"


class Settings(BaseSettings):
    """Environment-driven settings."""

    model_config = SettingsConfigDict(
        env_file=(REPO_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="before")
    @classmethod
    def _strip_empty_strings(cls, values: dict) -> dict:
        """Treat empty-string env vars as unset so that defaults apply.

        Vercel and other PaaS providers sometimes inject environment variables
        with empty values.  Pydantic cannot parse '' as bool or int, so we
        remove those entries before validation.
        """
        return {k: v for k, v in values.items() if v != ""}

    app_name: str = "AirIndex"
    environment: str = "development"
    debug: bool = True

    # Database individual fields or full DATABASE_URL
    db_host: str | None = None
    db_port: int | None = None
    db_name: str | None = None
    db_user: str | None = None
    db_password: str | None = None

    # SQLite by default so the project runs with no external service. Point this at
    # PostgreSQL for anything beyond a laptop demonstration:
    #   postgresql+psycopg://airindex:airindex@localhost:5432/airindex
    # Left unset so that DB_* variables can supply the URL instead. The SQLite
    # default is applied below, only when neither source provided one.
    database_url: str | None = None

    @model_validator(mode="after")
    def assemble_database_url(self) -> Settings:
        """Derive the URL from DB_* parts only when DATABASE_URL was not supplied.

        An explicit DATABASE_URL always wins: an operator who sets it means it.
        """
        if self.database_url:
            return self
        if self.db_host and self.db_user and self.db_name:
            credentials = quote_plus(self.db_user)
            if self.db_password:
                credentials = f"{credentials}:{quote_plus(self.db_password)}"
            port = self.db_port or 5432
            self.database_url = (
                f"postgresql+psycopg://{credentials}@{self.db_host}:{port}/{self.db_name}"
            )
        else:
            import os
            # On Vercel, /tmp is the only writable directory.
            if os.environ.get("VERCEL"):
                db_path = Path("/tmp/airindex.db").as_posix()
            else:
                db_path = (REPO_DIR / "airindex.db").as_posix()
            self.database_url = f"sqlite:///{db_path}"
        return self

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,https://air-index-tau.vercel.app,https://air-index-visionx.vercel.app"

    # Authentication. Read endpoints are open in development; admin always needs a key.
    api_key_required: bool = False
    admin_api_key: str = "dev-admin-key-change-me"
    read_api_keys: str = "dev-read-key"

    # Rate limiting, requests per minute per key or client address.
    rate_limit_per_minute: int = 120
    rate_limit_enabled: bool = True

    # Collection.
    collector_enabled_sources: str = "synthetic"
    collector_user_agent: str = (
        "AirIndexBot/0.1 (SIH26056 research prototype; contact: team-visionx@example.org)"
    )
    collector_requests_per_minute: int = 20
    collector_max_requests_per_run: int = 500
    collector_respect_robots: bool = True
    collector_live_adapters_enabled: bool = False
    scheduler_enabled: bool = False
    scheduler_cron_hour: int = 3
    scheduler_cron_minute: int = 0

    synthetic_seed: int = 26056

    # Model-backed analyst. Without a key the analyst stays on its deterministic path.
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-5"
    gemini_api_key: str | None = None
    google_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    analyst_provider: str = "auto"  # "auto", "gemini", or "anthropic"

    @property
    def effective_gemini_api_key(self) -> str | None:
        return self.gemini_api_key or self.google_api_key

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def read_key_list(self) -> list[str]:
        return [k.strip() for k in self.read_api_keys.split(",") if k.strip()]

    @property
    def enabled_source_list(self) -> list[str]:
        return [s.strip() for s in self.collector_enabled_sources.split(",") if s.strip()]

    @property
    def is_sqlite(self) -> bool:
        return bool(self.database_url and self.database_url.startswith("sqlite"))


@functools.lru_cache
def get_settings() -> Settings:
    return Settings()


def _load_yaml(name: str) -> dict[str, Any]:
    path = CONFIG_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Missing configuration file: {path}")
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"Configuration file {name} must contain a mapping")
    return data


@functools.lru_cache
def get_routes_config() -> dict[str, Any]:
    return _load_yaml("routes.yaml")


@functools.lru_cache
def get_weights_config() -> dict[str, Any]:
    return _load_yaml("weights.yaml")


@functools.lru_cache
def get_methodology_config() -> dict[str, Any]:
    return _load_yaml("methodology.yaml")


def clear_config_cache() -> None:
    """Drop cached YAML, used by tests and by the reload command."""
    get_routes_config.cache_clear()
    get_weights_config.cache_clear()
    get_methodology_config.cache_clear()
