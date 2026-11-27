"""Where uploaded files live: the CV, today.

A private S3 bucket reached through the node's instance profile. Nothing in it is
public; the API reads a file and serves it, so a file cannot be fetched by
guessing its address. Objects are encrypted at rest and the bucket keeps every
version, so replacing the CV never destroys the old one.

The interface is two methods on purpose. The API decides what a file is called
and whether it is acceptable; the store only keeps bytes.
"""

from __future__ import annotations

import asyncio
from typing import Any, Protocol

from app.core.config import get_settings


class BlobStore(Protocol):
    async def put(self, key: str, data: bytes, *, content_type: str) -> None: ...

    async def get(self, key: str) -> bytes | None: ...


class MemoryBlobStore:
    """For local development and tests."""

    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    async def put(self, key: str, data: bytes, *, content_type: str) -> None:
        self.objects[key] = (data, content_type)

    async def get(self, key: str) -> bytes | None:
        found = self.objects.get(key)
        return found[0] if found else None


class S3BlobStore:
    def __init__(self, bucket: str, region: str) -> None:
        self._bucket = bucket
        self._region = region
        self._client: Any = None

    @property
    def client(self) -> Any:
        if self._client is None:
            import boto3

            self._client = boto3.client("s3", region_name=self._region)
        return self._client

    async def put(self, key: str, data: bytes, *, content_type: str) -> None:
        await asyncio.to_thread(
            self.client.put_object,
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
            ServerSideEncryption="AES256",
        )

    async def get(self, key: str) -> bytes | None:
        def read() -> bytes | None:
            from botocore.exceptions import ClientError

            try:
                return bytes(self.client.get_object(Bucket=self._bucket, Key=key)["Body"].read())
            except ClientError as err:
                if err.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
                    return None
                raise

        return await asyncio.to_thread(read)


def build_blob_store() -> BlobStore | None:
    """None means uploads are not configured, which the API reports plainly."""
    settings = get_settings()
    if settings.mock_infra:
        return MemoryBlobStore()
    if settings.uploads_bucket:
        return S3BlobStore(settings.uploads_bucket, settings.aws_region)
    return None
