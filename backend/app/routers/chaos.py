"""The Break It endpoint.

Deletes one pod so a visitor can watch Kubernetes reschedule it. This is a
publicly reachable destructive operation, so the safety argument has to hold on
its own rather than relying on obscurity.

Four independent controls:

  1. RBAC. The ServiceAccount can delete pods in one namespace and nothing else.
     It cannot read Secrets, touch other namespaces, or modify a Deployment.
     This is the control that matters -- the rest are refinements.
  2. Replica floor. Refuses when it would take the last healthy pod. The demo is
     self-healing, not an outage.
  3. Rate limit. One deletion per window, process-local.
  4. Kill switch. chaos_enabled=false disables it entirely without a redeploy.

Control 3 is per-process, which means N replicas allow N deletions per window.
Correct implementation would put the counter in DynamoDB. At this scale, with
control 2 in place, the residual risk is a few extra reschedules -- accepted
knowingly and recorded here rather than left for a reviewer to discover.
"""

from __future__ import annotations

import logging
import random
import time

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.clients.k8s import KubernetesUnavailableError, k8s
from app.core.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chaos"])

_RATE_LIMIT_WINDOW = 20.0
_last_kill: float = 0.0


class ChaosResponse(BaseModel):
    killed: str
    message: str
    remaining_ready: int


@router.post("/chaos/kill-pod", response_model=ChaosResponse)
async def kill_pod() -> ChaosResponse:
    global _last_kill

    settings = get_settings()

    if not settings.chaos_enabled:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "chaos is disabled")

    if settings.mock_infra:
        return ChaosResponse(
            killed="circuit-breaker-api-7b2e004-a0x",
            message="Mock mode: nothing was actually deleted.",
            remaining_ready=1,
        )

    elapsed = time.monotonic() - _last_kill
    if elapsed < _RATE_LIMIT_WINDOW:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"rate limited, retry in {_RATE_LIMIT_WINDOW - elapsed:.0f}s",
        )

    try:
        snapshot = await k8s.snapshot()
    except KubernetesUnavailableError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    # Only target the API deployment. Killing the web pod would blank the page
    # the visitor is watching the demo on, which reads as a broken site rather
    # than a working recovery.
    candidates = [p for p in snapshot.pods if p.ready and p.name.startswith("circuit-breaker-api")]

    if len(candidates) < settings.chaos_min_replicas:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"refusing: only {len(candidates)} ready pod(s), "
            f"minimum is {settings.chaos_min_replicas}",
        )

    # S311: not a cryptographic decision. Picking which healthy pod to delete
    # for a demonstration needs to be arbitrary, not unpredictable.
    victim = random.choice(candidates)  # noqa: S311

    try:
        await k8s.delete_pod(victim.name)
    except Exception as exc:
        logger.exception("chaos deletion failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"deletion failed: {exc}") from exc

    _last_kill = time.monotonic()
    logger.warning("chaos: deleted %s", victim.name)

    return ChaosResponse(
        killed=victim.name,
        message="Pod deleted. Kubernetes is rescheduling it now.",
        remaining_ready=len(candidates) - 1,
    )
