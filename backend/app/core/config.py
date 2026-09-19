"""Runtime configuration.

Settings come from environment variables, optionally via a .env file at the repository
root. The three YAML files in backend/config are loaded here too and cached, because
they are configuration rather than data: routes, weights and methodology.
"""

from __future__ import annotations

import functools
from pathlib import Path
from typing import Any

import yaml
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

    app_name: str = "AirIndex"
    environment: str = "development"
    debug: bool = True

    # SQLite by default so the project runs with no external service. Point this at
    # PostgreSQL for anything beyond a laptop demonstration:
    #   postgresql+psycopg://airindex:airindex@localhost:5432/airindex
    database_url: str = f"sqlite:///{(REPO_DIR / 'airindex.db').as_posix()}"

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

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
        return self.database_url.startswith("sqlite")


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
