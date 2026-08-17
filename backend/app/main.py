"""Application entrypoint.

Walking skeleton: three endpoints, no external dependencies. Everything that
touches AWS or the Kubernetes API arrives in later phases, once this is proven
end to end through CI and into the cluster.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import get_settings
from app.core.state import state
from app.routers import chaos, health, infra

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup and shutdown hooks.

    The startup flag is what readiness reports on. The shutdown flag exists so a
    terminating pod fails readiness immediately and stops receiving new traffic
    while it finishes in-flight requests -- see the SIGTERM note in ADR-0003.
    """
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level,
        format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
    )
    logger.info(
        "starting %s sha=%s env=%s", settings.app_name, settings.git_sha, settings.environment
    )

    state.startup_complete = True
    yield

    state.shutting_down = True
    state.startup_complete = False
    logger.info("shutdown complete")


def create_app() -> FastAPI:
    """Factory rather than a module-level app object.

    Lets tests build an isolated instance with overridden settings instead of
    importing whatever global state the module happened to construct at import.
    """
    settings = get_settings()

    app = FastAPI(
        title="Circuit Breaker",
        version=settings.git_tag,
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    app.include_router(health.router, prefix="/api")
    app.include_router(infra.router, prefix="/api")
    app.include_router(chaos.router, prefix="/api")

    return app


app = create_app()
