"""Shared fixtures.

`cache` and `registry` are module-level singletons, so state leaks between tests
unless something resets it. Without this the suite becomes order-dependent: a
test passes alone and fails when run after another, which is among the more
demoralising things to debug.
"""

from collections.abc import Iterator

import pytest

from app.core.breaker import registry
from app.core.cache import cache
from app.core.state import state
from app.core.telemetry import Window, buffer


@pytest.fixture(autouse=True)
def clean_globals() -> Iterator[None]:
    registry._breakers.clear()
    yield
    registry._breakers.clear()
    cache._entries.clear()
    state.checks.clear()
    state.shutting_down = False
    buffer._window = Window()
