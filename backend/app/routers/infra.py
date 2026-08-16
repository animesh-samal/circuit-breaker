"""Infrastructure console endpoints.

Every one follows the same shape: resilient_fetch wraps the upstream call with a
breaker and a cache, and the response carries the provenance of the data --
live, cached, or stale -- rather than presenting all three identically.

The envelope is the important design decision. A plain payload forces the UI to
guess whether it is looking at current data. An envelope that states source,
age, and breaker state lets the interface be honest, which is the entire premise
of this project.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Generic, TypeVar

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.clients import mock
from app.clients.aws import aws
from app.clients.k8s import KubernetesUnavailable, k8s
from app.core.breaker import BreakerOpenError, registry
from app.core.config import get_settings
from app.core.resilient import Result, resilient_fetch

router = APIRouter(tags=["infrastructure"])

T = TypeVar("T")


class Envelope(BaseModel, Generic[T]):
    data: T
    source: str          # live | cache | stale | mock
    degraded: bool
    age_seconds: float
    breaker_state: str
    error: str | None = None
    mock: bool = False


def _wrap(result: Result[Any]) -> dict[str, Any]:
    return {
        "data": result.value,
        "source": result.source,
        "degraded": result.degraded,
        "age_seconds": round(result.age_seconds, 1),
        "breaker_state": result.breaker_state.value,
        "error": result.error,
        "mock": False,
    }


def _wrap_mock(value: Any) -> dict[str, Any]:
    return {
        "data": value,
        "source": "mock",
        "degraded": False,
        "age_seconds": 0.0,
        "breaker_state": "closed",
        "error": None,
        "mock": True,
    }


@router.get("/cluster")
async def cluster() -> dict[str, Any]:
    """Live pod and deployment state."""
    settings = get_settings()

    if settings.mock_infra:
        return _wrap_mock(asdict(mock.cluster_snapshot()))

    async def fetch() -> dict[str, Any]:
        return asdict(await k8s.snapshot())

    try:
        return _wrap(await resilient_fetch("kubernetes", fetch, ttl=settings.cluster_ttl))
    except (BreakerOpenError, KubernetesUnavailable) as exc:
        # 503, not 500. This is a dependency being unavailable, not a defect in
        # this service -- and the distinction matters to anything consuming the
        # status code, including alerting.
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc


@router.get("/metrics")
async def metrics() -> dict[str, Any]:
    settings = get_settings()

    if settings.mock_infra:
        return _wrap_mock([asdict(m) for m in mock.metrics()])

    async def fetch() -> list[dict[str, Any]]:
        return [asdict(m) for m in await aws.fetch_metrics()]

    try:
        return _wrap(await resilient_fetch("cloudwatch", fetch, ttl=settings.metrics_ttl))
    except BreakerOpenError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc


@router.get("/cost")
async def cost() -> dict[str, Any]:
    """Month-to-date spend.

    TTL is 24h by default. Cost Explorer bills $0.01 per request; at hourly
    granularity this endpoint would cost more per month than the server it
    reports on.
    """
    settings = get_settings()

    if settings.mock_infra:
        return _wrap_mock(asdict(mock.cost()))

    async def fetch() -> dict[str, Any]:
        return asdict(await aws.fetch_cost())

    try:
        return _wrap(
            await resilient_fetch(
                "cost-explorer",
                fetch,
                ttl=settings.cost_ttl,
                recovery_timeout=300.0,  # slow to retry: each attempt costs money
            )
        )
    except BreakerOpenError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc


@router.get("/deploys")
async def deploys(limit: int = 20) -> dict[str, Any]:
    settings = get_settings()
    limit = max(1, min(limit, 100))

    if settings.mock_infra:
        return _wrap_mock([asdict(d) for d in mock.deploys()])

    async def fetch() -> list[dict[str, Any]]:
        return [asdict(d) for d in await aws.fetch_deploys(limit)]

    try:
        return _wrap(await resilient_fetch("dynamodb", fetch, ttl=settings.deploys_ttl))
    except BreakerOpenError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc


@router.get("/breakers")
async def breakers() -> dict[str, Any]:
    """Every breaker's current state. Powers the resilience panel."""
    return {"breakers": [asdict(s) | {"state": s.state.value} for s in registry.all_stats()]}
