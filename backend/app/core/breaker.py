"""Circuit breaker.

The pattern: when a dependency starts failing, stop calling it. Retrying a
service that is already overloaded adds load to the thing you need to recover,
and makes every one of your own requests wait for a timeout that is going to
fail anyway. The breaker converts a slow failure into a fast one and gives the
upstream room to recover.

Three states:

    CLOSED     Normal. Calls pass through. Consecutive failures are counted.
    OPEN       Tripped. Calls are rejected immediately without touching the
               upstream. After recovery_timeout, allow one probe.
    HALF_OPEN  Probing. A limited number of calls are let through. Success
               closes the breaker; failure re-opens it and restarts the timer.

Why hand-rolled rather than pybreaker or purgatory: breaker state is a feature
of this application, not an implementation detail -- the UI renders it live, so
we need first-class access to state, timings, and failure counts. For a service
where the breaker were merely infrastructure, a library would be the right call.

Design note: this trips on *consecutive* failures. A rolling error-rate window
is more robust under mixed traffic, because one slow endpoint among many
healthy ones can otherwise trip the breaker for everything sharing it. At this
project's request volume a consecutive counter is adequate and far easier to
reason about; the trade-off is recorded rather than hidden.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class BreakerState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class BreakerOpenError(RuntimeError):
    """Raised instead of calling the upstream while the breaker is open."""

    def __init__(self, name: str, retry_after: float) -> None:
        super().__init__(f"circuit breaker '{name}' is open")
        self.name = name
        self.retry_after = retry_after


@dataclass
class BreakerStats:
    """Snapshot for the UI. Plain data, safe to serialise."""

    name: str
    state: BreakerState
    consecutive_failures: int
    total_failures: int
    total_successes: int
    total_rejections: int
    opened_at: float | None
    last_error: str | None


@dataclass
class CircuitBreaker:
    name: str
    failure_threshold: int = 3
    recovery_timeout: float = 30.0
    half_open_successes: int = 1

    _state: BreakerState = field(default=BreakerState.CLOSED, init=False)
    _consecutive_failures: int = field(default=0, init=False)
    _half_open_successes: int = field(default=0, init=False)
    _opened_at: float | None = field(default=None, init=False)
    _last_error: str | None = field(default=None, init=False)
    _total_failures: int = field(default=0, init=False)
    _total_successes: int = field(default=0, init=False)
    _total_rejections: int = field(default=0, init=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, init=False)

    # -- introspection -----------------------------------------------------

    @property
    def state(self) -> BreakerState:
        """Read-only view. Resolves the OPEN -> HALF_OPEN transition lazily so
        callers see the correct state without a background timer task."""
        if self._state is BreakerState.OPEN and self._recovery_elapsed():
            return BreakerState.HALF_OPEN
        return self._state

    def stats(self) -> BreakerStats:
        return BreakerStats(
            name=self.name,
            state=self.state,
            consecutive_failures=self._consecutive_failures,
            total_failures=self._total_failures,
            total_successes=self._total_successes,
            total_rejections=self._total_rejections,
            opened_at=self._opened_at,
            last_error=self._last_error,
        )

    def _recovery_elapsed(self) -> bool:
        return self._opened_at is not None and (time.monotonic() - self._opened_at) >= self.recovery_timeout

    # -- the call path -----------------------------------------------------

    async def call(self, fn: Callable[[], Awaitable[T]]) -> T:
        """Run `fn` under the breaker.

        Raises BreakerOpenError without invoking `fn` when open. Any other
        exception propagates to the caller after being recorded -- the breaker
        observes failures, it does not swallow them. Deciding what to do with a
        failure is the caller's job; see resilient.py.
        """
        async with self._lock:
            if self._state is BreakerState.OPEN:
                if self._recovery_elapsed():
                    self._state = BreakerState.HALF_OPEN
                    self._half_open_successes = 0
                    logger.info("breaker %s half-open, probing", self.name)
                else:
                    self._total_rejections += 1
                    retry_after = self.recovery_timeout - (time.monotonic() - (self._opened_at or 0.0))
                    raise BreakerOpenError(self.name, max(retry_after, 0.0))

        try:
            result = await fn()
        except Exception as exc:  # noqa: BLE001 -- any upstream failure counts
            await self._record_failure(exc)
            raise
        else:
            await self._record_success()
            return result

    async def _record_success(self) -> None:
        async with self._lock:
            self._total_successes += 1
            self._consecutive_failures = 0
            self._last_error = None

            if self._state is BreakerState.HALF_OPEN:
                self._half_open_successes += 1
                if self._half_open_successes >= self.half_open_successes:
                    self._state = BreakerState.CLOSED
                    self._opened_at = None
                    logger.info("breaker %s closed", self.name)
            else:
                self._state = BreakerState.CLOSED
                self._opened_at = None

    async def _record_failure(self, exc: Exception) -> None:
        async with self._lock:
            self._total_failures += 1
            self._consecutive_failures += 1
            self._last_error = f"{type(exc).__name__}: {exc}"[:200]

            # A failed probe re-opens immediately -- one success was requested
            # and one failure was returned, so there is nothing to deliberate.
            if self._state is BreakerState.HALF_OPEN or self._consecutive_failures >= self.failure_threshold:
                if self._state is not BreakerState.OPEN:
                    logger.warning(
                        "breaker %s opened after %d failures: %s",
                        self.name,
                        self._consecutive_failures,
                        self._last_error,
                    )
                self._state = BreakerState.OPEN
                self._opened_at = time.monotonic()

    def reset(self) -> None:
        """Force closed. Tests and the admin path only."""
        self._state = BreakerState.CLOSED
        self._consecutive_failures = 0
        self._opened_at = None
        self._last_error = None


class BreakerRegistry:
    """One breaker per upstream, not one globally.

    Sharing a breaker across dependencies means Cost Explorer failing would stop
    calls to CloudWatch -- unrelated services, coupled by an implementation
    detail. Isolation is the entire point of the pattern.
    """

    def __init__(self) -> None:
        self._breakers: dict[str, CircuitBreaker] = {}

    def get(self, name: str, **kwargs: Any) -> CircuitBreaker:
        if name not in self._breakers:
            self._breakers[name] = CircuitBreaker(name=name, **kwargs)
        return self._breakers[name]

    def all_stats(self) -> list[BreakerStats]:
        return [b.stats() for b in self._breakers.values()]

    def reset_all(self) -> None:
        for b in self._breakers.values():
            b.reset()


registry = BreakerRegistry()
