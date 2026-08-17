"""Circuit breaker behaviour.

The state machine is the part of this codebase most worth testing: it is pure
logic, it has three states and several transitions, and every one of its bugs
would appear as intermittent misbehaviour under load rather than as an obvious
failure.

No sleeps anywhere. Time is injected, so every transition is triggered exactly
rather than approximately -- these tests are deterministic and finish in
milliseconds. Sleeping would make them both slow and unreliable, because asyncio
fires timers up to one clock-resolution early (~15.6ms on Windows), which is
enough to flip a timing assertion at random.
"""

import asyncio

import pytest

from app.core.breaker import BreakerOpenError, BreakerState, CircuitBreaker, registry


class FakeClock:
    """A clock that only moves when told to."""

    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


async def ok() -> str:
    return "value"


async def boom() -> str:
    raise RuntimeError("upstream is unhappy")


async def test_starts_closed_and_passes_calls_through() -> None:
    b = CircuitBreaker(name="t", failure_threshold=2)
    assert await b.call(ok) == "value"
    assert b.state is BreakerState.CLOSED


async def test_failures_propagate_to_the_caller() -> None:
    """The breaker observes failures; it does not swallow them. Deciding what to
    do with one is the caller's job."""
    b = CircuitBreaker(name="t", failure_threshold=5)
    with pytest.raises(RuntimeError):
        await b.call(boom)
    assert b.state is BreakerState.CLOSED


async def test_opens_after_threshold_consecutive_failures() -> None:
    b = CircuitBreaker(name="t", failure_threshold=3)

    for _ in range(3):
        with pytest.raises(RuntimeError):
            await b.call(boom)

    assert b.state is BreakerState.OPEN


async def test_open_breaker_rejects_without_calling_upstream() -> None:
    """The point of the pattern: a fast, local failure instead of a slow one
    that adds load to a service already in trouble."""
    b = CircuitBreaker(name="t", failure_threshold=1, recovery_timeout=60)

    with pytest.raises(RuntimeError):
        await b.call(boom)

    called = False

    async def tracked() -> str:
        nonlocal called
        called = True
        return "value"

    with pytest.raises(BreakerOpenError):
        await b.call(tracked)

    assert called is False


async def test_rejection_reports_how_long_to_wait() -> None:
    clock = FakeClock()
    b = CircuitBreaker(name="t", failure_threshold=1, recovery_timeout=30, clock=clock)

    with pytest.raises(RuntimeError):
        await b.call(boom)

    clock.advance(10)

    with pytest.raises(BreakerOpenError) as exc:
        await b.call(ok)

    assert exc.value.retry_after == pytest.approx(20)


async def test_success_resets_the_consecutive_counter() -> None:
    """Consecutive, not cumulative. Two failures either side of a success must
    not add up to a trip."""
    b = CircuitBreaker(name="t", failure_threshold=3)

    for _ in range(2):
        with pytest.raises(RuntimeError):
            await b.call(boom)

    await b.call(ok)

    with pytest.raises(RuntimeError):
        await b.call(boom)

    assert b.state is BreakerState.CLOSED


async def test_stays_open_until_the_recovery_timeout_elapses() -> None:
    clock = FakeClock()
    b = CircuitBreaker(name="t", failure_threshold=1, recovery_timeout=30, clock=clock)

    with pytest.raises(RuntimeError):
        await b.call(boom)

    clock.advance(29.9)
    assert b.state is BreakerState.OPEN

    clock.advance(0.2)
    assert b.state is BreakerState.HALF_OPEN


async def test_successful_probe_closes_the_breaker() -> None:
    clock = FakeClock()
    b = CircuitBreaker(name="t", failure_threshold=1, recovery_timeout=30, clock=clock)

    with pytest.raises(RuntimeError):
        await b.call(boom)
    clock.advance(31)

    assert await b.call(ok) == "value"
    assert b.state is BreakerState.CLOSED


async def test_failed_probe_reopens_immediately() -> None:
    """One success was asked for and one failure came back, so there is nothing
    to deliberate -- it re-opens without waiting for the threshold again."""
    clock = FakeClock()
    b = CircuitBreaker(name="t", failure_threshold=3, recovery_timeout=30, clock=clock)

    for _ in range(3):
        with pytest.raises(RuntimeError):
            await b.call(boom)

    clock.advance(31)
    assert b.state is BreakerState.HALF_OPEN

    with pytest.raises(RuntimeError):
        await b.call(boom)

    assert b.state is BreakerState.OPEN
    # The timer restarts from the failed probe, not from the original trip.
    clock.advance(29)
    assert b.state is BreakerState.OPEN


async def test_stats_report_what_happened() -> None:
    b = CircuitBreaker(name="upstream", failure_threshold=2)

    await b.call(ok)
    with pytest.raises(RuntimeError):
        await b.call(boom)

    s = b.stats()
    assert s.name == "upstream"
    assert s.total_successes == 1
    assert s.total_failures == 1
    assert s.last_error is not None
    assert "RuntimeError" in s.last_error


async def test_rejections_are_counted() -> None:
    b = CircuitBreaker(name="t", failure_threshold=1, recovery_timeout=60)

    with pytest.raises(RuntimeError):
        await b.call(boom)

    for _ in range(3):
        with pytest.raises(BreakerOpenError):
            await b.call(ok)

    assert b.stats().total_rejections == 3


async def test_reset_forces_closed() -> None:
    b = CircuitBreaker(name="t", failure_threshold=1)

    with pytest.raises(RuntimeError):
        await b.call(boom)
    assert b.state is BreakerState.OPEN

    b.reset()
    assert b.state is BreakerState.CLOSED
    assert await b.call(ok) == "value"


async def test_registry_isolates_breakers() -> None:
    """One breaker per upstream. Sharing one would mean Cost Explorer failing
    stops calls to CloudWatch -- unrelated services coupled by an implementation
    detail, which is the opposite of what the pattern is for."""
    a = registry.get("cost-explorer", failure_threshold=1)
    b = registry.get("cloudwatch", failure_threshold=1)

    with pytest.raises(RuntimeError):
        await a.call(boom)

    assert a.state is BreakerState.OPEN
    assert b.state is BreakerState.CLOSED
    assert registry.get("cost-explorer") is a


async def test_concurrent_failures_do_not_double_count() -> None:
    """The lock exists for this. Ten simultaneous failures against a threshold
    of three should open the breaker, not corrupt the counter."""
    b = CircuitBreaker(name="t", failure_threshold=3)

    results = await asyncio.gather(*(b.call(boom) for _ in range(10)), return_exceptions=True)

    assert all(isinstance(r, Exception) for r in results)
    assert b.state is BreakerState.OPEN
    assert b.stats().total_failures == 10
