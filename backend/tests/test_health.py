"""Tests for the probe endpoints.

TestClient runs the app's lifespan, so startup_complete is set the same way it
would be in the cluster. That matters: readiness is a function of lifecycle
state, and a test that bypassed lifespan would assert against a state the
container never actually occupies.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.state import state
from app.main import create_app


@pytest.fixture(autouse=True)
def reset_state() -> Iterator[None]:
    """`state` is a process-global. Without this, a test that dirties it leaks
    into every test that runs after it, and the suite starts depending on
    execution order."""
    yield
    state.checks.clear()
    state.shutting_down = False


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as c:
        yield c


def test_health_returns_ok(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_ready_returns_200_after_startup(client: TestClient) -> None:
    r = client.get("/api/ready")
    assert r.status_code == 200
    assert r.json()["status"] == "ready"
    assert r.json()["checks"]["startup"] == "ok"


def test_ready_returns_503_when_a_check_fails(client: TestClient) -> None:
    """The status code, not the body, is what Kubernetes acts on."""
    state.checks["fake_dependency"] = "down"
    r = client.get("/api/ready")
    assert r.status_code == 503
    assert r.json()["status"] == "not_ready"


def test_ready_fails_while_draining(client: TestClient) -> None:
    """A terminating pod must stop attracting new traffic before it exits."""
    state.shutting_down = True
    r = client.get("/api/ready")
    assert r.status_code == 503
    assert r.json()["checks"]["lifecycle"] == "draining"


def test_version_exposes_build_metadata(client: TestClient) -> None:
    r = client.get("/api/version")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"app", "environment", "git_sha", "git_tag", "build_time"}
    assert body["app"] == "circuit-breaker"
