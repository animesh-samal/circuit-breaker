"""Application entrypoint."""

import asyncio
import contextlib
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response

from app.clients.aws import aws
from app.core.config import get_settings
from app.core.state import state
from app.core.telemetry import buffer
from app.routers import chaos, health, infra

logger = logging.getLogger(__name__)

# Probes hit these every few seconds forever. Counting them would make the
# request graph a flat line at the probe frequency and bury real traffic
# entirely -- the panel would show that Kubernetes is alive, which we already
# know from the pods being Running.
UNMEASURED = frozenset({"/api/health", "/api/ready"})


async def _flush_metrics() -> None:
    """Background flush loop.

    Wrapped so that a failure logs and continues. An unhandled exception in a
    background task kills it silently: metrics stop, nothing errors, and you
    find out weeks later when a graph has a flat section nobody noticed.
    """
    interval = get_settings().metrics_flush_seconds

    while True:
        await asyncio.sleep(interval)
        try:
            window = await buffer.drain()
            if window is not None:
                await aws.publish_window(window.requests, window.errors, window.latency_buckets)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("metric flush loop error")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level,
        format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
    )
    logger.info(
        "starting %s sha=%s env=%s", settings.app_name, settings.git_sha, settings.environment
    )

    task: asyncio.Task[None] | None = None
    if not settings.mock_infra:
        task = asyncio.create_task(_flush_metrics())

    state.startup_complete = True
    yield

    state.shutting_down = True
    state.startup_complete = False

    if task is not None:
        # Cancel, then flush once more. The preStop hook gives us a few seconds
        # of grace; spending some of it on the last window means the final
        # minute of traffic before a deploy is not silently discarded.
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

        try:
            window = await buffer.drain()
            if window is not None:
                await aws.publish_window(window.requests, window.errors, window.latency_buckets)
        except Exception:
            logger.warning("final metric flush failed")

    logger.info("shutdown complete")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Circuit Breaker",
        version=settings.git_tag,
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    @app.middleware("http")
    async def measure(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.url.path in UNMEASURED:
            return await call_next(request)

        # perf_counter, not time.time: it is monotonic, so an NTP correction
        # mid-request cannot produce a negative duration.
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            await buffer.record(500, (time.perf_counter() - started) * 1000)
            raise

        await buffer.record(response.status_code, (time.perf_counter() - started) * 1000)
        return response

    app.include_router(health.router, prefix="/api")
    app.include_router(infra.router, prefix="/api")
    app.include_router(chaos.router, prefix="/api")

    return app


app = create_app()
