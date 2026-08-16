"""Liveness, readiness, and build-metadata endpoints.

These three are infrastructure plumbing, not application features. They are the
contract between this container and whatever orchestrates it.

  /health   Kubernetes asks: are you alive, or should I restart you?
            Touches nothing external. Answering at all is the signal.

  /ready    Kubernetes asks: should I send you traffic?
            May check dependencies -- but only ones without which this service
            cannot do useful work. Degradable dependencies belong behind a
            circuit breaker, not here. See docs/adr/0003.

  /version  Humans and the UI ask: what exactly is running right now?
"""

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.core.state import state

router = APIRouter(tags=["observability"])


class HealthResponse(BaseModel):
    status: str


class ReadyResponse(BaseModel):
    status: str
    checks: dict[str, str]


class VersionResponse(BaseModel):
    app: str
    environment: str
    git_sha: str
    git_tag: str
    build_time: str


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness. Intentionally does no work.

    If the process is deadlocked, the event loop is blocked, or the port is not
    bound, this request never completes and the probe times out. That timeout is
    the diagnostic -- no dependency check would tell us anything more useful, and
    checking one would risk restarting a healthy container over an external fault.
    """
    return HealthResponse(status="ok")


@router.get("/ready", response_model=ReadyResponse)
async def ready(response: Response) -> ReadyResponse:
    """Readiness.

    Kubernetes reads the HTTP status code, not the body. A 200 with
    {"status": "not_ready"} still puts this pod into rotation, so the status code
    must be set explicitly when a check fails.
    """
    checks: dict[str, str] = {
        "startup": "ok" if state.startup_complete else "pending",
    }
    checks.update(state.checks)

    if state.shutting_down:
        checks["lifecycle"] = "draining"

    healthy = all(v == "ok" for v in checks.values())

    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return ReadyResponse(
        status="ready" if healthy else "not_ready",
        checks=checks,
    )


@router.get("/version", response_model=VersionResponse)
async def version(settings: Settings = Depends(get_settings)) -> VersionResponse:
    """Build provenance. Lets the UI show which commit is serving a request."""
    return VersionResponse(
        app=settings.app_name,
        environment=settings.environment,
        git_sha=settings.git_sha,
        git_tag=settings.git_tag,
        build_time=settings.build_time,
    )
