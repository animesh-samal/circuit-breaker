"""Representative fake data for local development.

Exists so the frontend can be built and demonstrated without a cluster or an AWS
account. Gated behind settings.mock_infra, which defaults to False and is set
true only by docker-compose.

Every response produced here is marked source="mock" and carries a `mock: true`
field all the way to the UI, which renders a visible banner. Fake telemetry that
cannot be distinguished from real telemetry is a liability -- during an incident
it is the difference between "the system is fine" and "I am looking at a
fixture".
"""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta

from app.clients.aws import CostBreakdown, DeployRecord, MetricSeries
from app.clients.k8s import ClusterSnapshot, ContainerInfo, DeploymentInfo, PodInfo

_SHAS = ["a3f9c21", "7b2e004", "c81de55", "19af7b3", "e4d0a18"]


def cluster_snapshot() -> ClusterSnapshot:
    now = datetime.now(UTC)
    pods: list[PodInfo] = []

    for deployment, replicas, image in (
        ("circuit-breaker-api", 2, "ghcr.io/animesh/circuit-breaker-api:v0.4.1"),
        ("circuit-breaker-web", 2, "ghcr.io/animesh/circuit-breaker-web:v0.4.1"),
    ):
        for i in range(replicas):
            age = random.uniform(600, 86_400)
            pods.append(
                PodInfo(
                    name=f"{deployment}-{random.choice(_SHAS)}-{random.choice('abcdefghijklmnop')}{i}x",
                    phase="Running",
                    ready=True,
                    node="ip-10-0-1-42.ap-south-1.compute.internal",
                    pod_ip=f"10.42.0.{20 + len(pods)}",
                    started_at=(now - timedelta(seconds=age)).isoformat(),
                    age_seconds=age,
                    restart_count=0,
                    containers=[
                        ContainerInfo(
                            name=deployment.replace("circuit-breaker-", ""),
                            image=image,
                            ready=True,
                            restart_count=0,
                            state="running",
                        )
                    ],
                )
            )

    deployments = [
        DeploymentInfo(
            name="circuit-breaker-api",
            desired=2,
            ready=2,
            available=2,
            updated=2,
            image="ghcr.io/animesh/circuit-breaker-api:v0.4.1",
        ),
        DeploymentInfo(
            name="circuit-breaker-web",
            desired=2,
            ready=2,
            available=2,
            updated=2,
            image="ghcr.io/animesh/circuit-breaker-web:v0.4.1",
        ),
    ]

    return ClusterSnapshot(
        namespace="circuit-breaker",
        pods=pods,
        deployments=deployments,
        observed_at=now.isoformat(),
    )


def metrics() -> list[MetricSeries]:
    now = datetime.now(UTC)
    stamps = [(now - timedelta(minutes=5 * i)).isoformat() for i in range(36)][::-1]

    def series(label: str, base: float, spread: float) -> MetricSeries:
        return MetricSeries(
            label=label,
            unit="",
            timestamps=stamps,
            values=[round(max(0.0, random.gauss(base, spread)), 2) for _ in stamps],
        )

    return [
        series("CPU utilisation", 12.0, 4.0),
        series("Requests", 140.0, 45.0),
        series("Errors", 0.4, 0.7),
        series("p95 latency (ms)", 38.0, 9.0),
    ]


def cost() -> CostBreakdown:
    today = datetime.now(UTC).date()
    by_service = {
        "Amazon Elastic Compute Cloud - Compute": 4.86,
        "Amazon Virtual Private Cloud": 2.19,
        "Amazon Elastic Container Registry": 0.11,
        "AWS Cost Explorer": 0.09,
        "Amazon DynamoDB": 0.02,
    }
    return CostBreakdown(
        month_to_date=round(sum(by_service.values()), 2),
        currency="USD",
        by_service=by_service,
        period_start=today.replace(day=1).isoformat(),
        period_end=today.isoformat(),
        forecast=11.40,
    )


def deploys() -> list[DeployRecord]:
    now = datetime.now(UTC)
    out: list[DeployRecord] = []
    for i, sha in enumerate(_SHAS):
        out.append(
            DeployRecord(
                deploy_id=f"2026-08-{15 - i:02d}T09:{20 + i}:00Z",
                git_sha=sha,
                git_tag=f"v0.4.{len(_SHAS) - i}",
                actor="animesh",
                started_at=(now - timedelta(days=i, hours=i)).isoformat(),
                duration_seconds=round(random.uniform(95, 240), 1),
                status="success" if i != 2 else "failed",
                environment="prod",
            )
        )
    return out
