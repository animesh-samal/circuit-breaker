"""The public side: what the website reads.

Two endpoints, both open to everyone and both read-only.

  GET /api/content   the site's content document, if the admin panel has saved one
  GET /api/cv        the current CV as a PDF

The site never depends on either. The pages ship with their content compiled in,
and `/api/content` only overrides it. So if the database is unreachable, or empty
because nothing has been saved yet, this answers "no content" and the site shows
what it was built with. Likewise `/api/cv` falls back to the PDF that ships with
the site. A failure here must never turn into a failure of the front page.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Response
from fastapi.responses import RedirectResponse

from app.core.config import get_settings
from app.core.resilient import resilient_fetch
from app.core.services import blob_store, content_store

logger = logging.getLogger(__name__)

router = APIRouter(tags=["content"])

# The PDF that is built into the site, used until a CV has been uploaded.
BUNDLED_CV = "/Animesh_Samal_CV.pdf"
CV_FILENAME = "Animesh_Samal_CV.pdf"


async def _current() -> tuple[int, dict[str, Any] | None, str | None, str]:
    """The saved document, how it was obtained, and its version.

    Returns (version, content, updated_at, source). Never raises: an unreachable
    store is reported as source "unavailable" with no content.
    """
    settings = get_settings()
    store = content_store()
    try:
        result = await resilient_fetch("content", store.get_current, settings.content_ttl)
    except Exception:
        logger.warning("content store unavailable; the site will use its built-in content")
        return 0, None, None, "unavailable"
    stored = result.value
    if stored is None:
        return 0, None, None, "empty"
    return stored.version, stored.content, stored.updated_at, result.source


@router.get("/content")
async def site_content(response: Response) -> dict[str, Any]:
    version, content, updated_at, source = await _current()
    # Short, so an edit shows up within a minute or so; long enough that a burst
    # of visitors does not turn into a burst of database reads.
    response.headers["Cache-Control"] = "public, max-age=15, stale-while-revalidate=60"
    return {"version": version, "content": content, "updated_at": updated_at, "source": source}


@router.get("/cv", response_model=None)
async def cv() -> Response:
    _, content, _, _ = await _current()
    info = (content or {}).get("cv")
    blobs = blob_store()
    if not info or blobs is None:
        return RedirectResponse(BUNDLED_CV, status_code=307)

    try:
        data = await blobs.get(str(info["key"]))
    except Exception:
        logger.exception("could not read the CV from storage")
        data = None
    if data is None:
        return RedirectResponse(BUNDLED_CV, status_code=307)

    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            # A fixed name, never one taken from the upload.
            "Content-Disposition": f'inline; filename="{CV_FILENAME}"',
            "ETag": f'"{info.get("sha256", "")}"',
            "Cache-Control": "public, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )
