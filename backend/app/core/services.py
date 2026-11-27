"""The stores the admin and content routes use, chosen once per process.

Kept in one small module so tests can swap them, and so the choice between the
real AWS stores and the in-memory ones (MOCK_INFRA) is made in exactly one place.
"""

from __future__ import annotations

from functools import lru_cache

from app.clients.blob_store import BlobStore, build_blob_store
from app.clients.content_store import ContentStore, build_content_store


@lru_cache
def content_store() -> ContentStore:
    return build_content_store()


@lru_cache
def blob_store() -> BlobStore | None:
    return build_blob_store()


def reset_services() -> None:
    content_store.cache_clear()
    blob_store.cache_clear()
