"""Rate limiting and retry.

Politeness is a correctness property here, not an afterthought. A collector that hammers
a portal produces worse data, because it gets served errors and bot walls, and it makes
the project indefensible at the same time.

Two mechanisms:
  - `TokenBucket` paces requests to a domain and honours any crawl delay robots.txt asked
    for, taking whichever is slower.
  - `retry_with_backoff` retries transient failures with exponential backoff and jitter.
    Jitter matters: without it, every retry in a run realigns into a burst.
"""

from __future__ import annotations

import random
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import TypeVar

T = TypeVar("T")


@dataclass
class TokenBucket:
    """A simple pacer: at most `rate_per_minute` requests, spread evenly.

    Deliberately not a burst-capable bucket. Bursting is exactly the behaviour that gets
    a crawler blocked, and there is no deadline here that a burst would help meet.
    """

    rate_per_minute: int
    min_interval_override: float | None = None
    _last_call: float = 0.0

    @property
    def interval(self) -> float:
        base = 60.0 / max(1, self.rate_per_minute)
        if self.min_interval_override is not None:
            return max(base, self.min_interval_override)
        return base

    def wait(self) -> float:
        """Block until the next request is due. Returns how long it slept."""
        now = time.monotonic()
        elapsed = now - self._last_call
        remaining = self.interval - elapsed
        if remaining > 0:
            time.sleep(remaining)
            self._last_call = time.monotonic()
            return remaining
        self._last_call = now
        return 0.0


class RequestBudget:
    """A hard ceiling on requests in one run.

    A bug in a route loop should cost one aborted run, not a day of traffic to somebody
    else's servers.
    """

    def __init__(self, maximum: int) -> None:
        self.maximum = maximum
        self.used = 0

    def spend(self, count: int = 1) -> bool:
        if self.used + count > self.maximum:
            return False
        self.used += count
        return True

    @property
    def remaining(self) -> int:
        return max(0, self.maximum - self.used)

    @property
    def exhausted(self) -> bool:
        return self.used >= self.maximum


def retry_with_backoff(
    operation: Callable[[], T],
    *,
    attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    jitter: float = 0.3,
    should_retry: Callable[[Exception], bool] | None = None,
) -> T:
    """Run `operation`, retrying transient failures.

    Raises the final exception when every attempt fails, so the caller records a real
    failure rather than a silently empty result.
    """
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            return operation()
        except Exception as exc:  # noqa: BLE001 - the retry policy decides what is fatal
            last_error = exc
            if should_retry is not None and not should_retry(exc):
                raise
            if attempt == attempts - 1:
                break
            delay = min(max_delay, base_delay * (2**attempt))
            delay *= 1.0 + random.uniform(-jitter, jitter)
            time.sleep(max(0.0, delay))
    assert last_error is not None
    raise last_error
