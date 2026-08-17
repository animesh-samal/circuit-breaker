"""The degradation policy.

This is where the breaker and the cache combine into the behaviour the whole
project is named after, and where the cost control lives -- a fresh cache hit
must not reach Cost Explorer, because each call there is billed.
"""

import asyncio

import pytest

from app.core.breaker import BreakerOpenError, BreakerState
from app.core.cache import cache
from app.core.resilient import resilient_fetch

# See the note in test_cache.py: these go through the cache's real clock, so the
# margins are wide enough to survive asyncio firing a timer early.
TTL = 0.05
PAST_TTL = 0.30


class Upstream:
    """Counts calls, so tests can assert the upstream was *not* reached."""

    def __init__(self, value: str = "fresh", fail: bool = False) -> None:
        self.value = value
        self.fail = fail
        self.calls = 0

    async def __call__(self) -> str:
        self.calls += 1
        if self.fail:
            raise RuntimeError("upstream down")
        return self.value


async def test_live_fetch_is_cached_and_marked_live() -> None:
    up = Upstream()
    result = await resilient_fetch("svc", up, ttl=60)

    assert result.value == "fresh"
    assert result.source == "live"
    assert result.degraded is False
    assert up.calls == 1


async def test_fresh_cache_does_not_touch_the_upstream() -> None:
    """The cost control. With a 24h TTL on Cost Explorer this is the difference
    between $0.30 and $7.20 a month."""
    up = Upstream()

    await resilient_fetch("svc", up, ttl=60)
    second = await resilient_fetch("svc", up, ttl=60)

    assert up.calls == 1
    assert second.source == "cache"
    assert second.degraded is False


async def test_stale_cache_is_served_when_the_upstream_fails() -> None:
    up = Upstream(value="good")
    await resilient_fetch("svc", up, ttl=TTL)
    await asyncio.sleep(PAST_TTL)

    up.fail = True
    result = await resilient_fetch("svc", up, ttl=TTL)

    assert result.value == "good"
    assert result.source == "stale"
    assert result.degraded is True
    assert result.error is not None


async def test_failure_with_nothing_cached_propagates() -> None:
    """Serving an empty object here would be worse than failing -- the caller
    could not distinguish "no data" from "no results"."""
    up = Upstream(fail=True)

    with pytest.raises(RuntimeError):
        await resilient_fetch("svc", up, ttl=60)


async def test_open_breaker_serves_stale_without_calling() -> None:
    up = Upstream(value="cached")
    await resilient_fetch("svc", up, ttl=TTL, failure_threshold=1)
    await asyncio.sleep(PAST_TTL)

    up.fail = True
    await resilient_fetch("svc", up, ttl=TTL, failure_threshold=1)
    calls_after_trip = up.calls

    result = await resilient_fetch("svc", up, ttl=TTL, failure_threshold=1)

    assert result.source == "stale"
    assert result.breaker_state is BreakerState.OPEN
    assert up.calls == calls_after_trip


async def test_open_breaker_with_no_cache_raises_breaker_open() -> None:
    up = Upstream(fail=True)

    with pytest.raises(RuntimeError):
        await resilient_fetch("svc", up, ttl=60, failure_threshold=1)

    await cache.clear()

    with pytest.raises(BreakerOpenError):
        await resilient_fetch("svc", up, ttl=60, failure_threshold=1)


async def test_recovery_returns_to_live() -> None:
    up = Upstream(value="v1", fail=True)

    with pytest.raises(RuntimeError):
        await resilient_fetch("svc", up, ttl=60, failure_threshold=1, recovery_timeout=TTL)

    await asyncio.sleep(PAST_TTL)
    up.fail = False
    up.value = "v2"

    result = await resilient_fetch("svc", up, ttl=60, failure_threshold=1, recovery_timeout=TTL)

    assert result.value == "v2"
    assert result.source == "live"
    assert result.degraded is False
