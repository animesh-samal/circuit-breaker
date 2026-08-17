"""AWS clients: CloudWatch, Cost Explorer, DynamoDB.

Credentials come from the EC2 instance profile -- the IAM role attached to the
node. No access keys exist anywhere in this repository, in the image, or in a
Kubernetes Secret. boto3 finds them automatically via the instance metadata
service, so there is nothing to rotate and nothing to leak.

Threading, again: boto3 is synchronous. A blocking call in an async handler
stalls the event loop for every concurrent request on that worker. Every call
here goes through asyncio.to_thread.

Cost Explorer deserves specific mention. It bills $0.01 per request. Polling it
hourly would cost ~$7.20/month, more than the EC2 instance this project runs on
-- the observability tool would become the largest line on the bill it reports.
A 24-hour TTL in resilient.py keeps it near $0.30. The API's own cost is a
design constraint, not an afterthought.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class MetricSeries:
    label: str
    unit: str
    timestamps: list[str]
    values: list[float]


@dataclass
class CostBreakdown:
    month_to_date: float
    currency: str
    by_service: dict[str, float]
    period_start: str
    period_end: str
    forecast: float | None = None


@dataclass
class DeployRecord:
    deploy_id: str
    git_sha: str
    git_tag: str
    actor: str
    started_at: str
    duration_seconds: float
    status: str
    environment: str


class AwsClients:
    """Lazily constructed. boto3 client creation reads config and can touch the
    network for region resolution, which should not happen at import time."""

    def __init__(self) -> None:
        self._cloudwatch: Any = None
        self._ce: Any = None
        self._dynamodb: Any = None

    def _region(self) -> str:
        return get_settings().aws_region

    @property
    def cloudwatch(self) -> Any:
        if self._cloudwatch is None:
            import boto3

            self._cloudwatch = boto3.client("cloudwatch", region_name=self._region())
        return self._cloudwatch

    @property
    def cost_explorer(self) -> Any:
        if self._ce is None:
            import boto3

            # Cost Explorer is a global service with a us-east-1 endpoint. It is
            # not available regionally -- pointing it at ap-south-1 fails.
            self._ce = boto3.client("ce", region_name="us-east-1")
        return self._ce

    @property
    def dynamodb(self) -> Any:
        if self._dynamodb is None:
            import boto3

            self._dynamodb = boto3.resource("dynamodb", region_name=self._region())
        return self._dynamodb

    # -- CloudWatch --------------------------------------------------------

    async def fetch_metrics(self, instance_id: str | None = None) -> list[MetricSeries]:
        return await asyncio.to_thread(self._fetch_metrics_sync, instance_id)

    def _fetch_metrics_sync(self, instance_id: str | None) -> list[MetricSeries]:
        end = datetime.now(UTC)
        start = end - timedelta(hours=3)

        queries: list[dict[str, Any]] = []
        if instance_id:
            queries.append(
                {
                    "Id": "cpu",
                    "Label": "CPU utilisation",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "AWS/EC2",
                            "MetricName": "CPUUtilization",
                            "Dimensions": [{"Name": "InstanceId", "Value": instance_id}],
                        },
                        "Period": 300,
                        "Stat": "Average",
                    },
                    "ReturnData": True,
                }
            )

        # Application metrics published by this service itself.
        for metric, label in (
            ("RequestCount", "Requests"),
            ("ErrorCount", "Errors"),
            ("RequestLatencyMs", "p95 latency (ms)"),
        ):
            queries.append(
                {
                    "Id": metric.lower(),
                    "Label": label,
                    "MetricStat": {
                        "Metric": {"Namespace": "CircuitBreaker", "MetricName": metric},
                        "Period": 300,
                        "Stat": "p95" if "Latency" in metric else "Sum",
                    },
                    "ReturnData": True,
                }
            )

        if not queries:
            return []

        resp = self.cloudwatch.get_metric_data(
            MetricDataQueries=queries,
            StartTime=start,
            EndTime=end,
            ScanBy="TimestampAscending",
        )

        return [
            MetricSeries(
                label=r.get("Label", r["Id"]),
                unit="",
                timestamps=[t.isoformat() for t in r.get("Timestamps", [])],
                values=[float(v) for v in r.get("Values", [])],
            )
            for r in resp.get("MetricDataResults", [])
        ]

    async def publish_metric(self, name: str, value: float, unit: str = "None") -> None:
        """Fire-and-forget. A failure to publish telemetry must never fail the
        request that generated it."""
        try:
            await asyncio.to_thread(
                self.cloudwatch.put_metric_data,
                Namespace="CircuitBreaker",
                MetricData=[{"MetricName": name, "Value": value, "Unit": unit}],
            )
        except Exception as exc:
            logger.debug("metric publish failed for %s: %s", name, exc)

    # -- Cost Explorer -----------------------------------------------------

    async def fetch_cost(self) -> CostBreakdown:
        return await asyncio.to_thread(self._fetch_cost_sync)

    def _fetch_cost_sync(self) -> CostBreakdown:
        today = datetime.now(UTC).date()
        start = today.replace(day=1)
        # Cost Explorer's End is exclusive; +1 day includes today.
        end = today + timedelta(days=1)

        resp = self.cost_explorer.get_cost_and_usage(
            TimePeriod={"Start": start.isoformat(), "End": end.isoformat()},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        )

        by_service: dict[str, float] = {}
        total = 0.0
        currency = "USD"

        for result in resp.get("ResultsByTime", []):
            for group in result.get("Groups", []):
                service = group["Keys"][0]
                amount_data = group["Metrics"]["UnblendedCost"]
                amount = float(amount_data["Amount"])
                currency = amount_data.get("Unit", "USD")
                if amount > 0:
                    by_service[service] = round(by_service.get(service, 0.0) + amount, 4)
                    total += amount

        return CostBreakdown(
            month_to_date=round(total, 2),
            currency=currency,
            by_service=dict(sorted(by_service.items(), key=lambda kv: kv[1], reverse=True)),
            period_start=start.isoformat(),
            period_end=today.isoformat(),
        )

    # -- DynamoDB ----------------------------------------------------------

    async def fetch_deploys(self, limit: int = 20) -> list[DeployRecord]:
        return await asyncio.to_thread(self._fetch_deploys_sync, limit)

    def _fetch_deploys_sync(self, limit: int) -> list[DeployRecord]:
        table = self.dynamodb.Table(get_settings().deploys_table)

        # Query on a fixed partition key with ScanIndexForward=False gives newest
        # first, and costs one read unit per item. A Scan would read the whole
        # table and grow more expensive with every deploy -- correct at ten rows,
        # wrong at ten thousand, and there is no reason to write the wrong one.
        resp = table.query(
            KeyConditionExpression="pk = :pk",
            ExpressionAttributeValues={":pk": "deploy"},
            ScanIndexForward=False,
            Limit=limit,
        )

        return [
            DeployRecord(
                deploy_id=str(item.get("sk", "")),
                git_sha=str(item.get("git_sha", "unknown")),
                git_tag=str(item.get("git_tag", "")),
                actor=str(item.get("actor", "unknown")),
                started_at=str(item.get("started_at", "")),
                duration_seconds=float(item.get("duration_seconds", Decimal(0))),
                status=str(item.get("status", "unknown")),
                environment=str(item.get("environment", "prod")),
            )
            for item in resp.get("Items", [])
        ]


aws = AwsClients()
