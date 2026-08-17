"""Request metrics, buffered.

The obvious implementation publishes to CloudWatch on every request. Don't:

  - `PutMetricData` is a network call, so every response would wait on AWS.
    A 40ms endpoint becomes a 90ms endpoint to record that it took 40ms.
  - It is billed per API request. At any real traffic the telemetry costs more
    than the thing it measures -- the same trap as Cost Explorer, one layer down.

So requests are counted in memory and flushed on a timer. Latencies are kept as
a small histogram rather than a running total, because CloudWatch can only
compute percentiles when it receives the distribution. A sum-and-count gives you
an average, and an average latency hides exactly the tail you care about.

Buckets are 5ms wide and capped at 150 distinct values, which is CloudWatch's
per-datum limit. At 5ms granularity that covers 0 to 750ms; anything slower
lands in the top bucket, which is fine, because by then the number you need is
"some requests are very slow", not its third significant figure.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

BUCKET_MS = 5
MAX_BUCKETS = 150


@dataclass
class Window:
    """One flush interval's worth of observations."""

    requests: int = 0
    errors: int = 0
    latency_buckets: dict[float, int] = field(default_factory=dict)

    @property
    def empty(self) -> bool:
        return self.requests == 0


class MetricBuffer:
    def __init__(self) -> None:
        self._window = Window()
        self._lock = asyncio.Lock()

    async def record(self, status_code: int, elapsed_ms: float) -> None:
        bucket = float(min(round(elapsed_ms / BUCKET_MS) * BUCKET_MS, BUCKET_MS * MAX_BUCKETS))

        async with self._lock:
            self._window.requests += 1
            # 5xx only. A 404 or a 429 is the service behaving correctly and
            # counting it as an error means the error rate alarm fires whenever
            # a crawler probes for /wp-admin.
            if status_code >= 500:
                self._window.errors += 1

            buckets = self._window.latency_buckets
            if bucket in buckets or len(buckets) < MAX_BUCKETS:
                buckets[bucket] = buckets.get(bucket, 0) + 1

    async def drain(self) -> Window | None:
        """Swap in a fresh window and return the old one.

        Swapping rather than clearing means requests arriving mid-flush land in
        the new window instead of being counted twice or lost.
        """
        async with self._lock:
            if self._window.empty:
                return None
            window, self._window = self._window, Window()
            return window


buffer = MetricBuffer()
