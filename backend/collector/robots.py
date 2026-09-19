"""The robots gate.

A disallow is a hard stop, not a warning. If the gate cannot reach robots.txt, or cannot
parse it, collection does not proceed for that source. Failing closed is the only
defensible default for a project whose output is meant to reach a ministry.

This is also why the gate lives in its own module with no dependency on any adapter: an
adapter cannot route around a check it never sees.
"""

from __future__ import annotations

import datetime as dt
import urllib.parse
import urllib.robotparser
from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class RobotsDecision:
    allowed: bool
    reason: str
    checked_at: dt.datetime
    crawl_delay: float | None = None
    robots_url: str | None = None


class RobotsGate:
    """Fetches and evaluates robots.txt, with a short in-process cache.

    The cache is short on purpose. Caching a permission for hours means collecting for
    hours after a site has withdrawn it.
    """

    def __init__(self, user_agent: str, cache_seconds: int = 900, timeout: float = 10.0) -> None:
        self.user_agent = user_agent
        self.cache_seconds = cache_seconds
        self.timeout = timeout
        self._cache: dict[str, tuple[dt.datetime, RobotsDecision]] = {}

    @staticmethod
    def robots_url_for(url: str) -> str:
        parts = urllib.parse.urlsplit(url)
        if not parts.scheme or not parts.netloc:
            raise ValueError(f"Cannot derive robots.txt location from {url!r}")
        return urllib.parse.urlunsplit((parts.scheme, parts.netloc, "/robots.txt", "", ""))

    def check(self, target_url: str) -> RobotsDecision:
        now = dt.datetime.now(dt.timezone.utc)
        try:
            robots_url = self.robots_url_for(target_url)
        except ValueError as exc:
            return RobotsDecision(False, f"invalid target url: {exc}", now)

        cached = self._cache.get(robots_url)
        if cached and (now - cached[0]).total_seconds() < self.cache_seconds:
            return cached[1]

        decision = self._fetch_and_evaluate(robots_url, target_url, now)
        self._cache[robots_url] = (now, decision)
        return decision

    def _fetch_and_evaluate(
        self, robots_url: str, target_url: str, now: dt.datetime
    ) -> RobotsDecision:
        try:
            response = httpx.get(
                robots_url,
                timeout=self.timeout,
                headers={"User-Agent": self.user_agent},
                follow_redirects=True,
            )
        except httpx.HTTPError as exc:
            return RobotsDecision(
                False,
                f"robots.txt unreachable, failing closed: {type(exc).__name__}",
                now,
                robots_url=robots_url,
            )

        if response.status_code == 404:
            # No robots.txt means no stated restriction. This is the one case where the
            # gate opens without an explicit allow, which matches the standard.
            return RobotsDecision(
                True, "no robots.txt published (404)", now, robots_url=robots_url
            )
        if response.status_code >= 400:
            return RobotsDecision(
                False,
                f"robots.txt returned HTTP {response.status_code}, failing closed",
                now,
                robots_url=robots_url,
            )

        parser = urllib.robotparser.RobotFileParser()
        try:
            parser.parse(response.text.splitlines())
        except Exception as exc:  # noqa: BLE001 - a malformed file must not crash a run
            return RobotsDecision(
                False, f"robots.txt unparseable, failing closed: {exc}", now, robots_url=robots_url
            )

        allowed = parser.can_fetch(self.user_agent, target_url)
        delay = parser.crawl_delay(self.user_agent)
        reason = "allowed by robots.txt" if allowed else "disallowed by robots.txt"
        return RobotsDecision(
            allowed=bool(allowed),
            reason=reason,
            checked_at=now,
            crawl_delay=float(delay) if delay else None,
            robots_url=robots_url,
        )

    def clear(self) -> None:
        self._cache.clear()
