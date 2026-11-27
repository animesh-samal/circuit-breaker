"""The content store, in memory and against an imitation of DynamoDB.

The same behaviour is checked on both, because the in-memory one stands in for
the real one in local development and in most other tests. The DynamoDB cases
run against moto, which evaluates the real condition and update expressions, so
a typo in one fails here instead of on the first save in production.
"""

import time
from collections.abc import Iterator
from typing import Any

import boto3
import pytest
from moto import mock_aws

from app.clients.content_store import (
    LOGIN_WINDOW_SECONDS,
    ContentStore,
    DynamoContentStore,
    MemoryContentStore,
    VersionConflictError,
)

TABLE = "test-content"
REGION = "ap-south-1"


def _create_table() -> None:
    boto3.client("dynamodb", region_name=REGION).create_table(
        TableName=TABLE,
        KeySchema=[
            {"AttributeName": "pk", "KeyType": "HASH"},
            {"AttributeName": "sk", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "pk", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


@pytest.fixture
def dynamo() -> Iterator[DynamoContentStore]:
    with mock_aws():
        _create_table()
        yield DynamoContentStore(TABLE, REGION)


@pytest.fixture(params=["memory", "dynamo"])
def store(request: pytest.FixtureRequest) -> Iterator[ContentStore]:
    if request.param == "memory":
        yield MemoryContentStore()
    else:
        with mock_aws():
            _create_table()
            yield DynamoContentStore(TABLE, REGION)


DOC: dict[str, Any] = {"projects": [{"id": "a", "title": "Café ☕", "stack": ["Python"]}]}


async def test_an_empty_store_has_no_document(store: ContentStore) -> None:
    assert await store.get_current() is None
    assert await store.history() == []


async def test_the_first_save_is_version_one(store: ContentStore) -> None:
    saved = await store.save(DOC, expected_version=0, actor="admin")
    assert saved.version == 1
    assert saved.updated_by == "admin"

    current = await store.get_current()
    assert current is not None
    assert current.version == 1
    # Non-ASCII text and nested lists must round-trip exactly.
    assert current.content == DOC


async def test_each_save_increments_the_version(store: ContentStore) -> None:
    await store.save({"a": 1}, expected_version=0, actor="admin")
    second = await store.save({"a": 2}, expected_version=1, actor="admin")
    assert second.version == 2
    current = await store.get_current()
    assert current is not None
    assert current.content == {"a": 2}


async def test_saving_from_an_old_version_is_refused(store: ContentStore) -> None:
    await store.save({"a": 1}, expected_version=0, actor="admin")
    await store.save({"a": 2}, expected_version=1, actor="admin")

    with pytest.raises(VersionConflictError) as caught:
        await store.save({"a": 3}, expected_version=1, actor="admin")
    assert caught.value.current_version == 2

    current = await store.get_current()
    assert current is not None
    assert current.content == {"a": 2}  # the refused save changed nothing


async def test_starting_from_scratch_when_a_document_exists_is_refused(store: ContentStore) -> None:
    await store.save({"a": 1}, expected_version=0, actor="admin")
    with pytest.raises(VersionConflictError):
        await store.save({"a": 9}, expected_version=0, actor="admin")


async def test_every_version_is_kept_and_listed_newest_first(store: ContentStore) -> None:
    for n in range(3):
        await store.save({"n": n}, expected_version=n, actor="admin")

    assert [h.version for h in await store.history()] == [3, 2, 1]
    old = await store.get_version(1)
    assert old is not None
    assert old.content == {"n": 0}
    assert await store.get_version(99) is None


async def test_history_respects_its_limit(store: ContentStore) -> None:
    for n in range(4):
        await store.save({"n": n}, expected_version=n, actor="admin")
    assert [h.version for h in await store.history(limit=2)] == [4, 3]


async def test_failed_sign_ins_are_counted_and_can_be_cleared(store: ContentStore) -> None:
    assert await store.login_failures() == 0
    assert await store.record_login_failure() == 1
    assert await store.record_login_failure() == 2
    assert await store.login_failures() == 2

    await store.clear_login_failures()
    assert await store.login_failures() == 0


async def test_a_code_step_can_be_claimed_once_and_never_goes_backwards(
    store: ContentStore,
) -> None:
    assert await store.claim_totp_step(100)
    assert not await store.claim_totp_step(100)  # the same code twice
    assert not await store.claim_totp_step(99)  # an older one
    assert await store.claim_totp_step(101)


async def test_the_memory_store_counts_failures_per_window() -> None:
    now = [1_000_000.0]
    store = MemoryContentStore(clock=lambda: now[0])
    await store.record_login_failure()
    assert await store.login_failures() == 1

    now[0] += LOGIN_WINDOW_SECONDS  # the next window starts clean
    assert await store.login_failures() == 0


async def test_dynamodb_history_items_carry_an_expiry(dynamo: DynamoContentStore) -> None:
    await dynamo.save({"a": 1}, expected_version=0, actor="admin")
    item = boto3.client("dynamodb", region_name=REGION).get_item(
        TableName=TABLE, Key={"pk": {"S": "content"}, "sk": {"S": "v#00000001"}}
    )["Item"]
    # About a year out, so DynamoDB removes old copies by itself.
    assert int(item["expires_at"]["N"]) > time.time() + 300 * 24 * 3600
