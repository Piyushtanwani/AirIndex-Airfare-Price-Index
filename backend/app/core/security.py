"""API keys and scopes.

Keys are compared by SHA-256 digest and with a constant-time comparison, so neither the
database nor a timing measurement reveals a key. The development keys in settings exist
so the project runs out of the box; they are refused outright when the environment is
not development.
"""

from __future__ import annotations

import hashlib
import hmac

from fastapi import Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings

INSECURE_DEFAULTS = {"dev-admin-key-change-me", "dev-read-key"}


def hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def _matches(candidate: str, known: str) -> bool:
    return hmac.compare_digest(hash_key(candidate), hash_key(known))


class Principal:
    """Who is calling and what they may do."""

    def __init__(self, name: str, scopes: set[str]) -> None:
        self.name = name
        self.scopes = scopes

    def has(self, scope: str) -> bool:
        return scope in self.scopes

    def __repr__(self) -> str:  # pragma: no cover - debugging convenience
        return f"Principal(name={self.name!r}, scopes={sorted(self.scopes)})"


ANONYMOUS = Principal("anonymous", {"read"})


def _reject_insecure_default(key: str, settings: Settings) -> None:
    if settings.environment != "development" and key in INSECURE_DEFAULTS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "The built-in development key is refused outside development. Set "
                "ADMIN_API_KEY and READ_API_KEYS to real values."
            ),
        )


def resolve_principal(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    settings: Settings = Depends(get_settings),
) -> Principal:
    """Identify the caller. Read access may be open; it is never guessed at."""
    if x_api_key:
        _reject_insecure_default(x_api_key, settings)
        if _matches(x_api_key, settings.admin_api_key):
            return Principal("admin", {"read", "admin"})
        for candidate in settings.read_key_list:
            if _matches(x_api_key, candidate):
                return Principal("reader", {"read"})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key"
        )

    if settings.api_key_required:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="An API key is required. Send it in the X-API-Key header.",
        )
    return ANONYMOUS


def require_admin(principal: Principal = Depends(resolve_principal)) -> Principal:
    if not principal.has("admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint requires an administrative API key.",
        )
    return principal
