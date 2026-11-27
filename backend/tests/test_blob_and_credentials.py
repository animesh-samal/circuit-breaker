"""The file store and the credential loader, against an imitation of AWS."""

import json
from collections.abc import Iterator

import boto3
import pytest
from moto import mock_aws

from app.clients.aws import AwsClients
from app.clients.blob_store import MemoryBlobStore, S3BlobStore
from app.core.admin_credentials import parse_credentials
from app.core.security import hash_password

REGION = "ap-south-1"
BUCKET = "test-uploads"


@pytest.fixture
def s3() -> Iterator[S3BlobStore]:
    with mock_aws():
        boto3.client("s3", region_name=REGION).create_bucket(
            Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": REGION}
        )
        yield S3BlobStore(BUCKET, REGION)


async def test_s3_stores_and_returns_bytes(s3: S3BlobStore) -> None:
    await s3.put("cv/a.pdf", b"%PDF-1.4 hello", content_type="application/pdf")
    assert await s3.get("cv/a.pdf") == b"%PDF-1.4 hello"


async def test_s3_encrypts_what_it_stores(s3: S3BlobStore) -> None:
    await s3.put("cv/a.pdf", b"%PDF-1.4", content_type="application/pdf")
    head = boto3.client("s3", region_name=REGION).head_object(Bucket=BUCKET, Key="cv/a.pdf")
    assert head["ServerSideEncryption"] == "AES256"
    assert head["ContentType"] == "application/pdf"


async def test_s3_reports_a_missing_file_as_none(s3: S3BlobStore) -> None:
    assert await s3.get("cv/nothing.pdf") is None


async def test_the_memory_store_behaves_the_same_way() -> None:
    blobs = MemoryBlobStore()
    await blobs.put("k", b"data", content_type="application/pdf")
    assert await blobs.get("k") == b"data"
    assert await blobs.get("missing") is None


def _parameter(**overrides: str) -> str:
    base = {
        "password_hash": hash_password("pw"),
        "totp_secret": "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
        # 32 bytes, base64url without padding
        "session_key": "a" * 43,
    }
    return json.dumps({**base, **overrides})


def test_a_complete_parameter_gives_credentials() -> None:
    creds = parse_credentials(_parameter())
    assert creds is not None
    assert creds.totp_secret.startswith("GEZ")
    assert len(creds.session_key) >= 32


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "not json",
        "[]",
        "{}",
        json.dumps({"password_hash": "x"}),
        _parameter(session_key="short"),
    ],
)
def test_a_damaged_parameter_means_not_set_up(raw: str) -> None:
    assert parse_credentials(raw) is None


async def test_the_encrypted_parameter_is_read_and_a_missing_one_is_none() -> None:
    with mock_aws():
        clients = AwsClients()
        assert await clients.get_secure_parameter("/circuit-breaker/admin") is None

        boto3.client("ssm", region_name=REGION).put_parameter(
            Name="/circuit-breaker/admin", Value=_parameter(), Type="SecureString"
        )
        raw = await clients.get_secure_parameter("/circuit-breaker/admin")
    assert raw is not None
    assert parse_credentials(raw) is not None
