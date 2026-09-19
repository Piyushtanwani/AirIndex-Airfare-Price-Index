"""Rate limiting.

A fixed-window counter per caller, held in process memory. That is the right size of
solution for a single-process prototype and the wrong one for a horizontally scaled
deployment, where the counter belongs in Redis. The limitation is stated here rather
than discovered later.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict

from fastapi import HTTPException, Request, status


class FixedWindowLimiter:
    def __init__(self, limit_per_minute: int) -> None:
        self.limit = limit_per_minute
        self.window_seconds = 60
        self._lock = threading.Lock()
        self._counters: dict[tuple[str, int], int] = defaultdict(int)

    def _prune(self, current_window: int) -> None:
        stale = [key for key in self._counters if key[1] < current_window - 1]
        for key in stale:
            del self._counters[key]

    def check(self, identity: str) -> tuple[bool, int, int]:
        """Returns (allowed, remaining, seconds_until_reset)."""
        now = time.time()
        window = int(now // self.window_seconds)
        reset_in = int(self.window_seconds - (now % self.window_seconds))
        with self._lock:
            self._prune(window)
            key = (identity, window)
            self._counters[key] += 1
            used = self._counters[key]
        remaining = max(0, self.limit - used)
        return used <= self.limit, remaining, reset_in


_limiter: FixedWindowLimiter | None = None


def get_limiter() -> FixedWindowLimiter:
    global _limiter
    if _limiter is None:
        from app.core.config import get_settings

        _limiter = FixedWindowLimiter(get_settings().rate_limit_per_minute)
    return _limiter


def enforce_rate_limit(request: Request) -> None:
    """FastAPI dependency. Identifies a caller by API key when present, address otherwise."""
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.rate_limit_enabled:
        return

    api_key = request.headers.get("X-API-Key")
    identity = api_key[:16] if api_key else (request.client.host if request.client else "unknown")

    allowed, remaining, reset_in = get_limiter().check(identity)
    request.state.rate_limit_remaining = remaining
    request.state.rate_limit_reset = reset_in
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit of {settings.rate_limit_per_minute} requests per minute exceeded.",
            headers={"Retry-After": str(reset_in)},
        )
