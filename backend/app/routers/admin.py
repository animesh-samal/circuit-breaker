"""The admin API: sign in, edit the site's content, replace the CV.

Everything here is behind a signed session cookie. The rules, and the reason for
each:

  * Sign-in needs the password AND a current one-time code. Either alone is not
    enough, and the same code cannot be used twice.
  * Five failures in fifteen minutes locks sign-in until the window ends. The
    count is in DynamoDB, so both replicas share it.
  * The cookie is HttpOnly (page scripts cannot read it), Secure, SameSite=Strict
    (other sites cannot make the browser send it) and limited to /api/admin.
  * Every change also needs an X-CSRF-Token header that matches the session. A
    forged request from another site has the cookie but cannot know the token.
  * A browser request that names an origin other than this site is refused.
  * Nothing here is cached (`Cache-Control: no-store`).
  * Saves are checked against the content model, so unsafe links and oversized
    text never reach the public site.

Failures say as little as possible. A wrong password, a wrong code and a replayed
code all produce the same answer after the same delay.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import re
import time
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, ValidationError

from app.clients.content_store import (
    LOGIN_WINDOW_SECONDS,
    MAX_LOGIN_FAILURES,
    VersionConflictError,
)
from app.core.admin_credentials import AdminCredentials, load_credentials
from app.core.cache import cache
from app.core.config import get_settings
from app.core.content_model import SiteContent
from app.core.security import (
    Session,
    new_csrf_token,
    read_session,
    sign_session,
    verify_password,
    verify_totp,
)
from app.core.services import blob_store, content_store

logger = logging.getLogger(__name__)

COOKIE = "cb_admin"
COOKIE_PATH = "/api/admin"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
MAX_CONTENT_BYTES = 300 * 1024
FAILURE_DELAY_SECONDS = 0.5
SIGN_IN_FAILED = "Sign-in failed. Check the password and the code."
NOT_SET_UP = "The admin panel is not set up yet. See docs/admin.md."


async def no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(no_store)])


# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------


def _allowed_origins() -> set[str]:
    settings = get_settings()
    origins = {o.strip() for o in settings.admin_origins.split(",") if o.strip()}
    if settings.mock_infra:
        origins |= {"http://localhost:5173", "http://127.0.0.1:5173", "http://testserver"}
    return origins


def _check_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin is not None and origin not in _allowed_origins():
        logger.warning("admin request refused: origin %s", origin)
        raise HTTPException(status_code=403, detail="This origin is not allowed.")


def _client_ip(request: Request) -> str:
    # For the log only. The header is set by the ingress and can be spoofed by a
    # client, so it is never used to make a decision.
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "?")


async def _credentials() -> AdminCredentials:
    creds = await load_credentials()
    if creds is None:
        raise HTTPException(status_code=503, detail=NOT_SET_UP)
    return creds


async def require_admin(request: Request) -> Session:
    creds = await load_credentials()
    token = request.cookies.get(COOKIE)
    session = read_session(creds.session_key, token) if creds and token else None
    if session is None:
        raise HTTPException(status_code=401, detail="Not signed in.")

    if request.method not in SAFE_METHODS:
        _check_origin(request)
        sent = request.headers.get("x-csrf-token", "")
        if not hmac.compare_digest(sent.encode(), session.csrf.encode()):
            logger.warning("admin request refused: bad CSRF token ip=%s", _client_ip(request))
            raise HTTPException(status_code=403, detail="Missing or wrong CSRF token.")
    return session


def _declared_length(request: Request) -> int:
    try:
        return int(request.headers.get("content-length", "0"))
    except ValueError:
        return 0


# ---------------------------------------------------------------------------
# Sign in and out
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=256)
    code: str = Field(min_length=1, max_length=16)


@router.post("/login")
async def login(body: LoginRequest, request: Request, response: Response) -> dict[str, Any]:
    _check_origin(request)
    settings = get_settings()
    creds = await _credentials()
    store = content_store()

    if await store.login_failures() >= MAX_LOGIN_FAILURES:
        retry_after = LOGIN_WINDOW_SECONDS - int(time.time()) % LOGIN_WINDOW_SECONDS
        logger.warning("admin sign-in locked out ip=%s", _client_ip(request))
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Try again in a few minutes.",
            headers={"Retry-After": str(retry_after)},
        )

    # scrypt is deliberately slow and memory-hungry, so it runs off the event loop.
    password_ok = await asyncio.to_thread(verify_password, body.password, creds.password_hash)
    step = verify_totp(creds.totp_secret, body.code)
    # The step is only used up when the password was right too, so someone who
    # only knows the password cannot burn the real owner's code.
    code_ok = password_ok and step is not None and await store.claim_totp_step(step)

    if not (password_ok and code_ok):
        await store.record_login_failure()
        logger.warning("admin sign-in failed ip=%s", _client_ip(request))
        await asyncio.sleep(FAILURE_DELAY_SECONDS)
        raise HTTPException(status_code=401, detail=SIGN_IN_FAILED)

    await store.clear_login_failures()
    now = int(time.time())
    session = Session(
        subject="admin",
        issued_at=now,
        expires_at=now + int(settings.admin_session_hours * 3600),
        csrf=new_csrf_token(),
    )
    response.set_cookie(
        COOKIE,
        sign_session(creds.session_key, session),
        max_age=int(settings.admin_session_hours * 3600),
        httponly=True,
        secure=settings.admin_cookie_secure,
        samesite="strict",
        path=COOKIE_PATH,
    )
    logger.info("admin signed in ip=%s", _client_ip(request))
    return {"csrf": session.csrf, "expires_at": session.expires_at}


@router.get("/me")
async def me(session: Session = Depends(require_admin)) -> dict[str, Any]:
    # The page calls this on load, because the CSRF token is not kept anywhere
    # a script could read it after a refresh.
    return {"authenticated": True, "csrf": session.csrf, "expires_at": session.expires_at}


@router.post("/logout")
async def logout(response: Response, session: Session = Depends(require_admin)) -> dict[str, bool]:
    response.delete_cookie(COOKIE, path=COOKIE_PATH)
    return {"ok": True}


# ---------------------------------------------------------------------------
# The content document
# ---------------------------------------------------------------------------


def _conflict(err: VersionConflictError) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "message": "The content changed after you opened it. Reload to see the latest version.",
            "current_version": err.current_version,
        },
    )


@router.get("/content")
async def get_content(session: Session = Depends(require_admin)) -> dict[str, Any]:
    stored = await content_store().get_current()
    if stored is None:
        return {"version": 0, "content": None, "updated_at": None, "updated_by": None}
    return {
        "version": stored.version,
        "content": stored.content,
        "updated_at": stored.updated_at,
        "updated_by": stored.updated_by,
    }


class SaveRequest(BaseModel):
    expected_version: int = Field(ge=0)
    content: SiteContent


@router.put("/content")
async def save_content(
    body: SaveRequest, request: Request, session: Session = Depends(require_admin)
) -> dict[str, Any]:
    if _declared_length(request) > MAX_CONTENT_BYTES:
        raise HTTPException(status_code=413, detail="That is too much text to save at once.")
    if not body.content.unique_project_ids():
        raise HTTPException(status_code=422, detail="Two projects share the same id.")

    store = content_store()
    current = await store.get_current()
    document = body.content.model_dump(mode="json", exclude_none=True)
    # The CV belongs to the upload endpoint. Whatever the form sends is ignored,
    # so a save can never point the CV at some other file in the bucket.
    document.pop("cv", None)
    if current and current.content.get("cv"):
        document["cv"] = current.content["cv"]

    try:
        saved = await store.save(
            document, expected_version=body.expected_version, actor=session.subject
        )
    except VersionConflictError as err:
        raise _conflict(err) from err

    await cache.invalidate("content")
    logger.info("admin saved content version=%d", saved.version)
    return {"version": saved.version, "updated_at": saved.updated_at}


# ---------------------------------------------------------------------------
# The CV
# ---------------------------------------------------------------------------

_UNSAFE_NAME = re.compile(r"[^A-Za-z0-9._ -]")


@router.put("/cv")
async def upload_cv(request: Request, session: Session = Depends(require_admin)) -> dict[str, Any]:
    settings = get_settings()
    blobs = blob_store()
    if blobs is None:
        raise HTTPException(status_code=503, detail="File storage is not set up yet.")

    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type != "application/pdf":
        raise HTTPException(status_code=415, detail="The CV must be a PDF.")
    if _declared_length(request) > settings.max_cv_bytes:
        raise HTTPException(status_code=413, detail="That file is too large for a CV.")

    # Read as it arrives and stop at the limit, so an upload that lies about its
    # size cannot fill the container's memory.
    data = bytearray()
    async for chunk in request.stream():
        data += chunk
        if len(data) > settings.max_cv_bytes:
            raise HTTPException(status_code=413, detail="That file is too large for a CV.")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="That file is not a PDF.")

    digest = hashlib.sha256(data).hexdigest()
    key = f"cv/{datetime.now(UTC):%Y%m%dT%H%M%SZ}-{digest[:12]}.pdf"
    await blobs.put(key, bytes(data), content_type="application/pdf")

    original = _UNSAFE_NAME.sub("", request.headers.get("x-filename", ""))[:80].strip()
    info = {
        "key": key,
        "filename": original or "Animesh_Samal_CV.pdf",
        "sha256": digest,
        "size": len(data),
        "updated_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }

    # Record it as a new version of the document, so the history shows when the
    # CV changed. A few retries cover someone saving the form at the same moment.
    store = content_store()
    for _ in range(3):
        current = await store.get_current()
        document = dict(current.content) if current else {}
        document["cv"] = info
        try:
            saved = await store.save(
                document, expected_version=current.version if current else 0, actor=session.subject
            )
        except VersionConflictError:
            continue
        await cache.invalidate("content")
        logger.info("admin uploaded a CV version=%d size=%d", saved.version, len(data))
        return {"version": saved.version, "cv": info}
    raise HTTPException(status_code=409, detail="The content kept changing. Try again.")


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


@router.get("/history")
async def history(session: Session = Depends(require_admin)) -> dict[str, Any]:
    entries = await content_store().history()
    return {
        "versions": [
            {"version": e.version, "updated_at": e.updated_at, "updated_by": e.updated_by}
            for e in entries
        ]
    }


class RestoreRequest(BaseModel):
    version: int = Field(ge=1)
    expected_version: int = Field(ge=0)


@router.post("/restore")
async def restore(
    body: RestoreRequest, session: Session = Depends(require_admin)
) -> dict[str, Any]:
    store = content_store()
    old = await store.get_version(body.version)
    if old is None:
        raise HTTPException(status_code=404, detail="There is no such version.")
    try:
        # Validated again: a version saved by an older release of the model must
        # still satisfy today's rules before it goes back on the public site.
        document = SiteContent.model_validate(old.content).model_dump(
            mode="json", exclude_none=True
        )
    except ValidationError as err:
        raise HTTPException(
            status_code=422, detail="That version no longer passes the checks."
        ) from err

    # Restoring brings back the text, not an older CV pointer: keep the current one.
    current = await store.get_current()
    document.pop("cv", None)
    if current and current.content.get("cv"):
        document["cv"] = current.content["cv"]
    try:
        saved = await store.save(
            document, expected_version=body.expected_version, actor=session.subject
        )
    except VersionConflictError as err:
        raise _conflict(err) from err
    await cache.invalidate("content")
    logger.info("admin restored version %d as %d", body.version, saved.version)
    return {"version": saved.version, "updated_at": saved.updated_at}
