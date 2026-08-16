"""Combines the breaker and the cache into the single pattern every upstream
call in this service uses.

The policy, in order:

  1. Fresh cache hit           -> return it, no upstream call at all.
  2. Breaker open              -> return stale cache, flagged degraded.
                                  If nothing is cached, fail honestly.
  3. Call the upstream.
     success                   -> cache and return, flagged live.
     failure, stale available  -> return stale, flagged degraded.
     failure, nothing cached   -> propagate the error.

Rule 1 is what keeps the Cost Explorer bill at cents rather than dollars: that
API charges $0.01 per request, so a 24-hour TTL is a cost control, not a
performance tweak. Rule 2 is what keeps the site up when AWS is having a bad
afternoon.

The `degraded` flag exists so the UI can be honest. Silently serving stale data
as though it were current is worse than an error, because it removes the
operator's ability to tell that anything is wrong.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

from app.core.breaker import BreakerOpenError, BreakerState, registry
from app.core.cache import cache

logger = logging.getLogger(__name__)

T = TypeVar("T")


@dataclass
class Result(Generic[T]):
    """A value plus the story of how it was obtained."""

    value: T
    degraded: bool
    source: str  # "live" | "cache" | "stale"
    age_seconds: float
    breaker_state: BreakerState
    error: str | None = None


async def resilient_fetch(
    name: str,
    fetch: Callable[[], Awaitable[T]],
    ttl: float,
    *,
    failure_threshold: int = 3,
    recovery_timeout: float = 30.0,
) -> Result[T]:
    breaker = registry.get(
        name,
        failure_threshold=failure_threshold,
        recovery_timeout=recovery_timeout,
    )

    entry = await cache.get(name)

    # 1. Fresh cache. The upstream is never touched.
    if entry is not None and entry.is_fresh:
        return Result(
            value=entry.value,
            degraded=False,
            source="cache",
            age_seconds=entry.age_seconds,
            breaker_state=breaker.state,
        )

    # 2. Breaker open. Do not call; serve what we have.
    if breaker.state is BreakerState.OPEN:
        if entry is not None:
            return Result(
                value=entry.value,
                degraded=True,
                source="stale",
                age_seconds=entry.age_seconds,
                breaker_state=BreakerState.OPEN,
                error=breaker.stats().last_error,
            )
        raise BreakerOpenError(name, breaker.recovery_timeout)

    # 3. Call it.
    try:
        value = await breaker.call(fetch)
    except Exception as exc:  # noqa: BLE001
        if entry is not None:
            logger.warning("%s failed, serving stale (age %.0fs): %s", name, entry.age_seconds, exc)
            return Result(
                value=entry.value,
                degraded=True,
                source="stale",
                age_seconds=entry.age_seconds,
                breaker_state=breaker.state,
                error=f"{type(exc).__name__}: {exc}"[:200],
            )
        logger.error("%s failed with no cached fallback: %s", name, exc)
        raise

    stored = await cache.set(name, value, ttl)
    return Result(
        value=stored.value,
        degraded=False,
        source="live",
        age_seconds=0.0,
        breaker_state=breaker.state,
    )
