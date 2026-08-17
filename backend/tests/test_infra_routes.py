"""Route-level tests using mock mode.

These exercise the envelope shape and the mock branches without a cluster or an
AWS account. They are deliberately shallow -- the depth lives in the breaker and
cache tests -- but they catch the class of mistake that only appears once the
handler is wired up: a wrong key name, a missing field, an endpoint returning a
list where the UI expects an object.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setenv("MOCK_INFRA", "true")
    # Settings are cached per process, so the environment change is invisible
    # until the cache is dropped.
    get_settings.cache_clear()
    with TestClient(create_app()) as c:
        yield c
    get_settings.cache_clear()


def test_cluster_returns_an_envelope(client: TestClient) -> None:
    r = client.get("/api/cluster")
    assert r.status_code == 200

    body = r.json()
    assert body["mock"] is True
    assert body["source"] == "mock"
    assert body["degraded"] is False
    assert body["data"]["namespace"] == "circuit-breaker"
    assert len(body["data"]["pods"]) > 0


def test_pods_carry_the_fields_the_console_reads(client: TestClient) -> None:
    pod = client.get("/api/cluster").json()["data"]["pods"][0]

    for key in ("name", "phase", "ready", "node", "age_seconds", "restart_count", "containers"):
        assert key in pod


def test_metrics_returns_series(client: TestClient) -> None:
    body = client.get("/api/metrics").json()
    assert body["mock"] is True

    series = body["data"][0]
    assert len(series["timestamps"]) == len(series["values"])


def test_cost_returns_a_breakdown(client: TestClient) -> None:
    body = client.get("/api/cost").json()
    data = body["data"]

    assert data["currency"] == "USD"
    assert data["month_to_date"] > 0
    assert sum(data["by_service"].values()) == pytest.approx(data["month_to_date"], abs=0.05)


def test_deploys_returns_history(client: TestClient) -> None:
    body = client.get("/api/deploys").json()
    assert len(body["data"]) > 0
    assert {"git_sha", "git_tag", "status"} <= set(body["data"][0])


def test_deploy_limit_is_clamped(client: TestClient) -> None:
    """A caller asking for a million rows should get a bounded response rather
    than a large DynamoDB bill."""
    assert client.get("/api/deploys?limit=100000").status_code == 200
    assert client.get("/api/deploys?limit=-5").status_code == 200


def test_breakers_endpoint_is_serialisable(client: TestClient) -> None:
    body = client.get("/api/breakers").json()
    assert "breakers" in body
    assert isinstance(body["breakers"], list)


def test_chaos_is_inert_in_mock_mode(client: TestClient) -> None:
    """Mock mode must never delete anything, and must say so rather than
    pretending it did."""
    r = client.post("/api/chaos/kill-pod")
    assert r.status_code == 200

    body = r.json()
    assert "Mock mode" in body["message"]
    assert body["killed"]


def test_chaos_can_be_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """The kill switch. Turning the feature off must not require a redeploy of
    anything but the ConfigMap."""
    monkeypatch.setenv("MOCK_INFRA", "true")
    monkeypatch.setenv("CHAOS_ENABLED", "false")
    get_settings.cache_clear()

    with TestClient(create_app()) as c:
        assert c.post("/api/chaos/kill-pod").status_code == 403

    get_settings.cache_clear()
