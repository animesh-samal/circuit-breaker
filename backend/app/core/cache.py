"""In-process TTL cache with explicit stale retention.

Two properties matter here, and the second is the unusual one:

  1. Entries expire after a TTL, so data stays reasonably fresh.
  2. Expired entries are *kept*, not deleted. When an upstream is unavailable,
     stale data is far better than an error page -- provided the staleness is
     visible rather than silently pretended away. Every value carries the age
     that produced it so the UI can say "4 minutes old" instead of implying it
     is current.

Scope: per-process. Each replica keeps its own copy, so two pods can hold
different values for the same key. Acceptable here because every cached value is
observational. Anything requiring agreement across replicas belongs in DynamoDB.

Alternative considered: Redis. Correct answer for shared cache state, and wrong
for this project -- it adds a StatefulSet, a network hop, and a new failure mode
to a workload with one node and no coherence requirement.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

T = TypeVar("T")


@dataclass(frozen=True)
class CachedValue(Generic[T]):
    value: T
    stored_at: float
    ttl: float

    @property
    def age_seconds(self) -> float:
        return time.time() - self.stored_at

    @property
    def is_fresh(self) -> bool:
        return self.age_seconds < self.ttl


class TTLCache:
    def __init__(self) -> None:
        self._entries: dict[str, CachedValue[Any]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> CachedValue[Any] | None:
        """Return the entry regardless of freshness.

        Callers decide what to do with a stale value; the cache does not decide
        for them. Returning None on expiry would throw away the only thing that
        makes graceful degradation possible.
        """
        async with self._lock:
            return self._entries.get(key)

    async def get_fresh(self, key: str) -> Any | None:
        entry = await self.get(key)
        return entry.value if entry is not None and entry.is_fresh else None

    async def set(self, key: str, value: Any, ttl: float) -> CachedValue[Any]:
        async with self._lock:
            entry = CachedValue(value=value, stored_at=time.time(), ttl=ttl)
            self._entries[key] = entry
            return entry

    async def clear(self) -> None:
        async with self._lock:
            self._entries.clear()

    def keys(self) -> list[str]:
        return list(self._entries)


cache = TTLCache()
