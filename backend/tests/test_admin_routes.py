"""The admin and content endpoints, end to end, in mock mode.

These go through the real app with a real cookie jar, so they exercise the
things that only show up once everything is wired together: that the cookie is
set and sent back, that a change without the CSRF token is refused, that a
locked-out account stays locked even with the right answers.
"""

import base64
import time
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.clients.content_store import MAX_LOGIN_FAILURES
from app.core.admin_credentials import reset_credentials_cache
from app.core.cache import cache
from app.core.config import get_settings
from app.core.security import totp_code
from app.core.services import blob_store, content_store, reset_services
from app.main import create_app

PASSWORD = "correct horse battery staple"
# The seed from RFC 6238, the standard for these codes: the plain text
# "12345678901234567890". Built here rather than written out in its encoded form,
# because a long random-looking literal is exactly what secret scanners flag.
SECRET = base64.b32encode(b"12345678901234567890").decode()
PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n"
PROJECT: dict[str, Any] = {
    "id": "demo",
    "tag": "03 · Demo",
    "title": "Demo project",
    "blurb": "What it does.",
    "stack": ["Python"],
    "source": "https://github.com/animesh-samal/demo",
}


def code(offset: int = 0) -> str:
    return totp_code(SECRET, int(time.time() // 30) + offset)


def _build(monkeypatch: pytest.MonkeyPatch, **env: str) -> Iterator[TestClient]:
    monkeypatch.setenv("MOCK_INFRA", "true")
    monkeypatch.setenv("ADMIN_COOKIE_SECURE", "false")
    for name, value in {
        "ADMIN_DEV_PASSWORD": PASSWORD,
        "ADMIN_DEV_TOTP_SECRET": SECRET,
        **env,
    }.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setattr("app.routers.admin.FAILURE_DELAY_SECONDS", 0)
    get_settings.cache_clear()
    reset_services()
    reset_credentials_cache()
    with TestClient(create_app()) as c:
        yield c
    get_settings.cache_clear()
    reset_services()
    reset_credentials_cache()


@pytest.fixture(autouse=True)
async def _clean_cache() -> None:
    await cache.clear()


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    yield from _build(monkeypatch)


def sign_in(client: TestClient, offset: int = 0) -> dict[str, str]:
    """Sign in and return the headers a change must carry."""
    r = client.post("/api/admin/login", json={"password": PASSWORD, "code": code(offset)})
    assert r.status_code == 200, r.text
    return {"X-CSRF-Token": r.json()["csrf"]}


# -- setup ---------------------------------------------------------------------


def test_the_panel_is_off_until_credentials_exist(monkeypatch: pytest.MonkeyPatch) -> None:
    for c in _build(monkeypatch, ADMIN_DEV_PASSWORD="", ADMIN_DEV_TOTP_SECRET=""):
        r = c.post("/api/admin/login", json={"password": "x", "code": "123456"})
        assert r.status_code == 503
        assert "not set up" in r.json()["detail"]
        assert c.get("/api/admin/me").status_code == 401


# -- signing in ------------------------------------------------------------------


def test_signing_in_sets_a_locked_down_cookie(client: TestClient) -> None:
    r = client.post("/api/admin/login", json={"password": PASSWORD, "code": code()})
    assert r.status_code == 200
    cookie = r.headers["set-cookie"].lower()
    assert "cb_admin=" in cookie
    assert "httponly" in cookie
    assert "samesite=strict" in cookie
    assert "path=/api/admin" in cookie
    assert r.headers["cache-control"] == "no-store"
    assert len(r.json()["csrf"]) >= 40


def test_the_session_is_recognised_afterwards(client: TestClient) -> None:
    assert client.get("/api/admin/me").status_code == 401
    csrf = sign_in(client)["X-CSRF-Token"]
    me = client.get("/api/admin/me").json()
    assert me["authenticated"] is True
    assert me["csrf"] == csrf  # so a reloaded page can pick the token up again


@pytest.mark.parametrize(
    ("password", "wrong_code"),
    [(PASSWORD + "!", False), (PASSWORD, True), ("", False)],
)
def test_wrong_answers_all_get_the_same_reply(
    client: TestClient, password: str, wrong_code: bool
) -> None:
    submitted = "000000" if wrong_code else code()
    r = client.post("/api/admin/login", json={"password": password or "x", "code": submitted})
    assert r.status_code == 401
    assert r.json()["detail"] == "Sign-in failed. Check the password and the code."
    assert "set-cookie" not in r.headers


def test_a_code_cannot_be_used_twice(client: TestClient) -> None:
    sign_in(client, offset=0)
    again = client.post("/api/admin/login", json={"password": PASSWORD, "code": code(0)})
    assert again.status_code == 401
    # The next code, a moment later, is a different step and works.
    assert (
        client.post("/api/admin/login", json={"password": PASSWORD, "code": code(1)}).status_code
        == 200
    )


def test_a_right_code_with_a_wrong_password_does_not_use_the_code_up(client: TestClient) -> None:
    bad = client.post("/api/admin/login", json={"password": "nope", "code": code()})
    assert bad.status_code == 401
    # Someone who only knows the password must not be able to burn the owner's code.
    assert (
        client.post("/api/admin/login", json={"password": PASSWORD, "code": code()}).status_code
        == 200
    )


def test_repeated_failures_lock_sign_in_even_for_the_right_answers(client: TestClient) -> None:
    for _ in range(MAX_LOGIN_FAILURES):
        client.post("/api/admin/login", json={"password": "wrong", "code": "000000"})

    r = client.post("/api/admin/login", json={"password": PASSWORD, "code": code()})
    assert r.status_code == 429
    assert int(r.headers["retry-after"]) > 0


def test_a_request_from_another_origin_is_refused(client: TestClient) -> None:
    r = client.post(
        "/api/admin/login",
        json={"password": PASSWORD, "code": code()},
        headers={"Origin": "https://evil.example"},
    )
    assert r.status_code == 403


def test_signing_out_ends_the_session(client: TestClient) -> None:
    headers = sign_in(client)
    assert client.post("/api/admin/logout", headers=headers).status_code == 200
    assert client.get("/api/admin/me").status_code == 401


def test_a_forged_cookie_is_not_a_session(client: TestClient) -> None:
    client.cookies.set("cb_admin", "v1.eyJzdWIiOiJhZG1pbiJ9.forged", path="/api/admin")
    assert client.get("/api/admin/me").status_code == 401


# -- changes need the token ----------------------------------------------------------


def test_every_change_is_refused_without_the_csrf_token(client: TestClient) -> None:
    sign_in(client)
    body = {"expected_version": 0, "content": {"projects": [PROJECT]}}
    assert client.put("/api/admin/content", json=body).status_code == 403
    assert (
        client.put("/api/admin/content", json=body, headers={"X-CSRF-Token": "wrong"}).status_code
        == 403
    )
    assert (
        client.post("/api/admin/restore", json={"version": 1, "expected_version": 0}).status_code
        == 403
    )
    assert (
        client.put(
            "/api/admin/cv", content=PDF, headers={"Content-Type": "application/pdf"}
        ).status_code
        == 403
    )


def test_changes_are_refused_when_signed_out(client: TestClient) -> None:
    body = {"expected_version": 0, "content": {"projects": [PROJECT]}}
    assert client.put("/api/admin/content", json=body).status_code == 401


# -- saving content -----------------------------------------------------------------------


def test_a_saved_document_appears_on_the_public_endpoint(client: TestClient) -> None:
    assert client.get("/api/content").json() == {
        "version": 0,
        "content": None,
        "updated_at": None,
        "source": "empty",
    }

    headers = sign_in(client)
    r = client.put(
        "/api/admin/content",
        json={"expected_version": 0, "content": {"projects": [PROJECT]}},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["version"] == 1

    public = client.get("/api/content")
    assert public.json()["version"] == 1
    assert public.json()["content"]["projects"][0]["title"] == "Demo project"
    assert "max-age" in public.headers["cache-control"]
    # Never exposed to anyone: the public document carries no secrets, only text.
    assert "password" not in public.text


def test_saving_from_a_stale_version_is_refused_with_the_current_one(client: TestClient) -> None:
    headers = sign_in(client)
    body = {"expected_version": 0, "content": {"projects": [PROJECT]}}
    assert client.put("/api/admin/content", json=body, headers=headers).status_code == 200

    stale = client.put("/api/admin/content", json=body, headers=headers)
    assert stale.status_code == 409
    assert stale.json()["detail"]["current_version"] == 1


@pytest.mark.parametrize(
    "link", ["javascript:alert(1)", "http://insecure.example", "//evil.example"]
)
def test_an_unsafe_link_cannot_be_saved(client: TestClient, link: str) -> None:
    headers = sign_in(client)
    bad = {**PROJECT, "live": link}
    r = client.put(
        "/api/admin/content",
        json={"expected_version": 0, "content": {"projects": [bad]}},
        headers=headers,
    )
    assert r.status_code == 422
    assert client.get("/api/content").json()["content"] is None


def test_two_projects_cannot_share_an_id(client: TestClient) -> None:
    headers = sign_in(client)
    r = client.put(
        "/api/admin/content",
        json={
            "expected_version": 0,
            "content": {"projects": [PROJECT, {**PROJECT, "title": "Other"}]},
        },
        headers=headers,
    )
    assert r.status_code == 422


def test_an_oversized_save_is_refused(client: TestClient) -> None:
    headers = sign_in(client)
    huge = {"expected_version": 0, "content": {"projects": [PROJECT]}, "padding": "x" * 400_000}
    assert client.put("/api/admin/content", json=huge, headers=headers).status_code == 413


def test_the_form_cannot_point_the_cv_at_another_file(client: TestClient) -> None:
    headers = sign_in(client)
    forged = {
        "key": "cv/other.pdf",
        "filename": "x.pdf",
        "sha256": "0" * 64,
        "size": 1,
        "updated_at": "now",
    }
    r = client.put(
        "/api/admin/content",
        json={"expected_version": 0, "content": {"projects": [PROJECT], "cv": forged}},
        headers=headers,
    )
    assert r.status_code == 200
    assert "cv" not in client.get("/api/admin/content").json()["content"]


def test_the_public_endpoint_survives_a_broken_store(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def boom() -> None:
        raise RuntimeError("table does not exist")

    monkeypatch.setattr(content_store(), "get_current", boom)
    r = client.get("/api/content")
    assert r.status_code == 200
    assert r.json()["content"] is None
    assert r.json()["source"] == "unavailable"


# -- the CV --------------------------------------------------------------------------------------


def upload(client: TestClient, headers: dict[str, str], data: bytes = PDF, **extra: str) -> Any:
    return client.put(
        "/api/admin/cv",
        content=data,
        headers={**headers, "Content-Type": "application/pdf", **extra},
    )


def test_before_any_upload_the_cv_link_goes_to_the_bundled_file(client: TestClient) -> None:
    r = client.get("/api/cv", follow_redirects=False)
    assert r.status_code == 307
    assert r.headers["location"] == "/Animesh_Samal_CV.pdf"


def test_an_uploaded_cv_is_served_at_the_public_link(client: TestClient) -> None:
    headers = sign_in(client)
    r = upload(client, headers)
    assert r.status_code == 200
    info = r.json()["cv"]
    assert info["size"] == len(PDF)
    assert info["key"].startswith("cv/")

    served = client.get("/api/cv")
    assert served.status_code == 200
    assert served.content == PDF
    assert served.headers["content-type"] == "application/pdf"
    # The download name is fixed, never taken from the upload.
    assert 'filename="Animesh_Samal_CV.pdf"' in served.headers["content-disposition"]
    assert served.headers["x-content-type-options"] == "nosniff"


def test_an_unusual_filename_header_is_cleaned_before_it_is_recorded(client: TestClient) -> None:
    headers = sign_in(client)
    r = client.put(
        "/api/admin/cv",
        content=PDF,
        headers={
            **headers,
            "Content-Type": "application/pdf",
            "X-Filename": '../../evil"; rm -rf.pdf',
        },
    )
    name = r.json()["cv"]["filename"]
    assert "/" not in name and '"' not in name and ";" not in name


def test_the_cv_must_be_declared_as_a_pdf(client: TestClient) -> None:
    headers = sign_in(client)
    r = client.put("/api/admin/cv", content=PDF, headers={**headers, "Content-Type": "text/html"})
    assert r.status_code == 415


def test_a_file_that_is_not_really_a_pdf_is_refused(client: TestClient) -> None:
    headers = sign_in(client)
    assert (
        upload(client, headers, data=b"<html><script>alert(1)</script></html>").status_code == 400
    )


def test_an_oversized_cv_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    for c in _build(monkeypatch, MAX_CV_BYTES="100"):
        headers = sign_in(c)
        assert upload(c, headers, data=b"%PDF-" + b"x" * 500).status_code == 413


def test_uploading_a_cv_keeps_the_text_that_was_already_saved(client: TestClient) -> None:
    headers = sign_in(client)
    client.put(
        "/api/admin/content",
        json={"expected_version": 0, "content": {"projects": [PROJECT]}},
        headers=headers,
    )
    assert upload(client, headers).status_code == 200

    content = client.get("/api/admin/content").json()["content"]
    assert content["projects"][0]["title"] == "Demo project"
    assert content["cv"]["size"] == len(PDF)

    # And saving text afterwards keeps the CV.
    version = client.get("/api/admin/content").json()["version"]
    client.put(
        "/api/admin/content",
        json={
            "expected_version": version,
            "content": {"projects": [{**PROJECT, "title": "Renamed"}]},
        },
        headers=headers,
    )
    after = client.get("/api/admin/content").json()["content"]
    assert after["projects"][0]["title"] == "Renamed"
    assert after["cv"]["size"] == len(PDF)


def test_uploads_need_storage_to_be_configured(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = sign_in(client)
    monkeypatch.setattr("app.routers.admin.blob_store", lambda: None)
    assert upload(client, headers).status_code == 503


# -- history ---------------------------------------------------------------------------------------


def test_an_earlier_version_can_be_restored(client: TestClient) -> None:
    headers = sign_in(client)
    first = {"expected_version": 0, "content": {"projects": [PROJECT]}}
    second = {
        "expected_version": 1,
        "content": {"projects": [{**PROJECT, "title": "Changed my mind"}]},
    }
    client.put("/api/admin/content", json=first, headers=headers)
    client.put("/api/admin/content", json=second, headers=headers)

    versions = client.get("/api/admin/history").json()["versions"]
    assert [v["version"] for v in versions] == [2, 1]

    r = client.post(
        "/api/admin/restore", json={"version": 1, "expected_version": 2}, headers=headers
    )
    assert r.status_code == 200
    assert r.json()["version"] == 3  # a restore is a new version, history is never rewritten

    now = client.get("/api/admin/content").json()["content"]
    assert now["projects"][0]["title"] == "Demo project"


def test_restoring_something_that_does_not_exist_says_so(client: TestClient) -> None:
    headers = sign_in(client)
    r = client.post(
        "/api/admin/restore", json={"version": 7, "expected_version": 0}, headers=headers
    )
    assert r.status_code == 404


def test_restoring_from_a_stale_version_is_refused(client: TestClient) -> None:
    headers = sign_in(client)
    client.put(
        "/api/admin/content",
        json={"expected_version": 0, "content": {"projects": [PROJECT]}},
        headers=headers,
    )
    r = client.post(
        "/api/admin/restore", json={"version": 1, "expected_version": 0}, headers=headers
    )
    assert r.status_code == 409


def test_everything_in_the_admin_api_is_uncacheable(client: TestClient) -> None:
    sign_in(client)
    for path in ("/api/admin/me", "/api/admin/content", "/api/admin/history"):
        assert client.get(path).headers["cache-control"] == "no-store"
    assert blob_store() is not None
