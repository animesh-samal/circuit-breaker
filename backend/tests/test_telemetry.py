"""Metric buffering.

Cheap to test and easy to get subtly wrong -- an off-by-one in the drain swap
means either double-counted or silently dropped requests, and neither shows up
as an error anywhere.
"""

from app.core.telemetry import BUCKET_MS, MAX_BUCKETS, MetricBuffer


async def test_counts_requests() -> None:
    b = MetricBuffer()
    for _ in range(3):
        await b.record(200, 12.0)

    w = await b.drain()
    assert w is not None
    assert w.requests == 3
    assert w.errors == 0


async def test_only_5xx_counts_as_an_error() -> None:
    """A 404 or a 429 is the service working correctly. Counting them means the
    error-rate alarm fires every time a crawler probes for /wp-admin."""
    b = MetricBuffer()
    for status in (200, 301, 404, 429, 499):
        await b.record(status, 5.0)
    for status in (500, 503):
        await b.record(status, 5.0)

    w = await b.drain()
    assert w is not None
    assert w.requests == 7
    assert w.errors == 2


async def test_latencies_are_bucketed() -> None:
    b = MetricBuffer()
    await b.record(200, 11.0)  # -> 10
    await b.record(200, 12.0)  # -> 10
    await b.record(200, 23.0)  # -> 25

    w = await b.drain()
    assert w is not None
    assert w.latency_buckets == {10.0: 2, 25.0: 1}


async def test_bucket_count_is_capped() -> None:
    """CloudWatch accepts at most 150 distinct values per datum. Exceeding it
    fails the whole publish, so the cap belongs here rather than at the API."""
    b = MetricBuffer()
    for i in range(MAX_BUCKETS * 3):
        await b.record(200, float(i * BUCKET_MS))

    w = await b.drain()
    assert w is not None
    assert len(w.latency_buckets) <= MAX_BUCKETS


async def test_drain_returns_none_when_empty() -> None:
    """Nothing to publish means no API call, and no API call means no charge."""
    assert await MetricBuffer().drain() is None


async def test_drain_swaps_rather_than_clears() -> None:
    """A request arriving after a drain belongs to the next window, not to a
    window that has already been sent."""
    b = MetricBuffer()
    await b.record(200, 10.0)

    first = await b.drain()
    assert first is not None
    assert first.requests == 1

    await b.record(200, 10.0)
    second = await b.drain()
    assert second is not None
    assert second.requests == 1

    # The first window must not have been mutated by later activity.
    assert first.requests == 1
