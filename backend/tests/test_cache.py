"""Cache behaviour.

The unusual property here is that expired entries are kept rather than deleted.
That is what makes graceful degradation possible, so it is worth a test that
would fail if someone "tidied up" by evicting on expiry.
"""

import asyncio

from app.core.cache import TTLCache

# The cache reads the wall clock directly, so these tests have to wait rather
# than advance a fake clock as the breaker tests do. The margin is deliberately
# wide: asyncio fires timers up to one clock-resolution early -- ~15.6ms on
# Windows -- so a sleep only slightly longer than the TTL fails at random.
# Injecting a clock here too would be more rigorous; the cache has exactly one
# time comparison, so the effort is put where the state machine is instead.
TTL = 0.05
PAST_TTL = 0.30


async def test_stores_and_returns_a_value() -> None:
    c = TTLCache()
    await c.set("k", {"a": 1}, ttl=60)

    entry = await c.get("k")
    assert entry is not None
    assert entry.value == {"a": 1}
    assert entry.is_fresh


async def test_missing_key_returns_none() -> None:
    c = TTLCache()
    assert await c.get("nope") is None
    assert await c.get_fresh("nope") is None


async def test_entry_goes_stale_after_its_ttl() -> None:
    c = TTLCache()
    await c.set("k", "v", ttl=TTL)
    await asyncio.sleep(PAST_TTL)

    entry = await c.get("k")
    assert entry is not None
    assert entry.is_fresh is False


async def test_expired_entries_are_retained() -> None:
    """The important one. get() returns stale data and lets the caller decide;
    returning None on expiry would throw away the only fallback available when
    an upstream is down."""
    c = TTLCache()
    await c.set("k", "old", ttl=TTL)
    await asyncio.sleep(PAST_TTL)

    assert await c.get_fresh("k") is None

    entry = await c.get("k")
    assert entry is not None
    assert entry.value == "old"


async def test_age_is_reported_so_staleness_can_be_shown() -> None:
    c = TTLCache()
    await c.set("k", "v", ttl=60)
    await asyncio.sleep(TTL)

    entry = await c.get("k")
    assert entry is not None
    assert entry.age_seconds > 0


async def test_set_overwrites_and_refreshes_age() -> None:
    c = TTLCache()
    await c.set("k", "first", ttl=TTL)
    await asyncio.sleep(PAST_TTL)
    await c.set("k", "second", ttl=60)

    entry = await c.get("k")
    assert entry is not None
    assert entry.value == "second"
    assert entry.is_fresh


async def test_clear_empties_everything() -> None:
    c = TTLCache()
    await c.set("a", 1, ttl=60)
    await c.set("b", 2, ttl=60)
    assert sorted(c.keys()) == ["a", "b"]

    await c.clear()
    assert c.keys() == []
