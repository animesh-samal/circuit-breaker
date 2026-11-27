"""Where the site's content is kept, and the few small facts the sign-in needs.

One DynamoDB table holds three kinds of item, all under a partition key `pk`:

  content / current       the live document, with its version number
  content / v#00000012    a copy of every version ever saved, so any of them can
                          be restored; deleted by DynamoDB itself after a year
  login / fails#<window>  failed sign-in count for a 15-minute window
  login / totp            the last one-time-code step that was accepted

Why a table and not a file on the pod: the API runs as two replicas with a
read-only filesystem, so a file would be a different file on each pod. Why not
Kubernetes: the cluster is for running the site, not for storing what is said on
it, and a ConfigMap edit would need a deploy. DynamoDB is already here and at
this volume sits inside the always-free tier.

Saves are conditional on the version the editor started from. If two tabs open
the same version and both save, the second is refused rather than silently
overwriting the first (VersionConflictError), and the editor is told to reload.
The document and its history copy are written in one transaction, so there is
never a version number without a copy of it.

The document is stored as a JSON string, not as DynamoDB's native types. Native
numbers come back as Decimal and need converting; a string round-trips exactly
and keeps this module ignorant of the document's shape, which is the model's job.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from app.core.config import get_settings

logger = logging.getLogger(__name__)

CONTENT_PK = "content"
CURRENT_SK = "current"
HISTORY_PREFIX = "v#"
LOGIN_PK = "login"
TOTP_SK = "totp"

HISTORY_SECONDS = 400 * 24 * 3600
# Failed sign-ins are counted in fixed windows of this length. A fixed window
# makes the count a single atomic ADD; the price is that an attacker can get a
# burst across a window boundary, which five guesses against a password and a
# changing code makes harmless.
LOGIN_WINDOW_SECONDS = 900
MAX_LOGIN_FAILURES = 5


@dataclass(frozen=True)
class StoredContent:
    version: int
    content: dict[str, Any]
    updated_at: str
    updated_by: str


@dataclass(frozen=True)
class HistoryEntry:
    version: int
    updated_at: str
    updated_by: str


class VersionConflictError(Exception):
    """The document changed after the editor opened it."""

    def __init__(self, current_version: int) -> None:
        super().__init__(f"content is at version {current_version}")
        self.current_version = current_version


class ContentStore(Protocol):
    async def get_current(self) -> StoredContent | None: ...

    async def save(
        self, content: dict[str, Any], *, expected_version: int, actor: str
    ) -> StoredContent: ...

    async def history(self, limit: int = 30) -> list[HistoryEntry]: ...

    async def get_version(self, version: int) -> StoredContent | None: ...

    async def login_failures(self) -> int: ...

    async def record_login_failure(self) -> int: ...

    async def clear_login_failures(self) -> None: ...

    async def claim_totp_step(self, step: int) -> bool: ...


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _window(now: float) -> int:
    return int(now // LOGIN_WINDOW_SECONDS)


# ---------------------------------------------------------------------------
# In memory: local development and tests
# ---------------------------------------------------------------------------


class MemoryContentStore:
    """The same behaviour as the DynamoDB store, kept in a dict.

    Used when MOCK_INFRA is on and throughout the tests. It enforces the same
    version check, so a bug in the optimistic-concurrency handling shows up here
    first, without needing AWS.
    """

    def __init__(self, clock: Callable[[], float] = time.time) -> None:
        self._clock = clock
        self._versions: dict[int, StoredContent] = {}
        self._failures: dict[int, int] = {}
        self._totp_step = 0

    async def get_current(self) -> StoredContent | None:
        return self._versions[max(self._versions)] if self._versions else None

    async def save(
        self, content: dict[str, Any], *, expected_version: int, actor: str
    ) -> StoredContent:
        current = max(self._versions) if self._versions else 0
        if expected_version != current:
            raise VersionConflictError(current)
        saved = StoredContent(
            version=current + 1,
            content=json.loads(json.dumps(content)),
            updated_at=_now_iso(),
            updated_by=actor,
        )
        self._versions[saved.version] = saved
        return saved

    async def history(self, limit: int = 30) -> list[HistoryEntry]:
        newest_first = sorted(self._versions.values(), key=lambda s: s.version, reverse=True)
        return [HistoryEntry(s.version, s.updated_at, s.updated_by) for s in newest_first[:limit]]

    async def get_version(self, version: int) -> StoredContent | None:
        return self._versions.get(version)

    async def login_failures(self) -> int:
        return self._failures.get(_window(self._clock()), 0)

    async def record_login_failure(self) -> int:
        window = _window(self._clock())
        self._failures[window] = self._failures.get(window, 0) + 1
        return self._failures[window]

    async def clear_login_failures(self) -> None:
        self._failures.pop(_window(self._clock()), None)

    async def claim_totp_step(self, step: int) -> bool:
        if step <= self._totp_step:
            return False
        self._totp_step = step
        return True


# ---------------------------------------------------------------------------
# DynamoDB: production
# ---------------------------------------------------------------------------


def _s(value: str) -> dict[str, str]:
    return {"S": value}


def _n(value: int) -> dict[str, str]:
    return {"N": str(value)}


class DynamoContentStore:
    """Production store. boto3 is synchronous, so every call goes through a
    thread, as in the other AWS clients: a blocking call in an async handler
    would stall every concurrent request on the worker."""

    def __init__(self, table: str, region: str) -> None:
        self._table = table
        self._region = region
        self._client: Any = None

    @property
    def client(self) -> Any:
        if self._client is None:
            import boto3

            self._client = boto3.client("dynamodb", region_name=self._region)
        return self._client

    # -- the document -------------------------------------------------------

    async def get_current(self) -> StoredContent | None:
        return await asyncio.to_thread(self._get, CURRENT_SK)

    async def get_version(self, version: int) -> StoredContent | None:
        return await asyncio.to_thread(self._get, f"{HISTORY_PREFIX}{version:08d}")

    def _get(self, sk: str) -> StoredContent | None:
        item = self.client.get_item(
            TableName=self._table,
            Key={"pk": _s(CONTENT_PK), "sk": _s(sk)},
            ConsistentRead=True,
        ).get("Item")
        return _decode(item) if item else None

    async def save(
        self, content: dict[str, Any], *, expected_version: int, actor: str
    ) -> StoredContent:
        return await asyncio.to_thread(self._save, content, expected_version, actor)

    def _save(self, content: dict[str, Any], expected: int, actor: str) -> StoredContent:
        from botocore.exceptions import ClientError

        version = expected + 1
        updated_at = _now_iso()
        data = json.dumps(content, separators=(",", ":"), sort_keys=True)
        body = {
            "version": _n(version),
            "data": _s(data),
            "updated_at": _s(updated_at),
            "updated_by": _s(actor),
        }

        put_current: dict[str, Any] = {
            "TableName": self._table,
            "Item": {"pk": _s(CONTENT_PK), "sk": _s(CURRENT_SK), **body},
        }
        if expected == 0:
            put_current["ConditionExpression"] = "attribute_not_exists(pk)"
        else:
            put_current["ConditionExpression"] = "#v = :expected"
            put_current["ExpressionAttributeNames"] = {"#v": "version"}
            put_current["ExpressionAttributeValues"] = {":expected": _n(expected)}

        put_history = {
            "TableName": self._table,
            "Item": {
                "pk": _s(CONTENT_PK),
                "sk": _s(f"{HISTORY_PREFIX}{version:08d}"),
                "expires_at": _n(int(time.time()) + HISTORY_SECONDS),
                **body,
            },
        }

        try:
            self.client.transact_write_items(
                TransactItems=[{"Put": put_current}, {"Put": put_history}]
            )
        except ClientError as err:
            if err.response.get("Error", {}).get("Code") == "TransactionCanceledException":
                current = self._get(CURRENT_SK)
                raise VersionConflictError(current.version if current else 0) from err
            raise
        return StoredContent(version, json.loads(data), updated_at, actor)

    async def history(self, limit: int = 30) -> list[HistoryEntry]:
        return await asyncio.to_thread(self._history, limit)

    def _history(self, limit: int) -> list[HistoryEntry]:
        response = self.client.query(
            TableName=self._table,
            KeyConditionExpression="pk = :pk AND begins_with(sk, :prefix)",
            ExpressionAttributeValues={":pk": _s(CONTENT_PK), ":prefix": _s(HISTORY_PREFIX)},
            ExpressionAttributeNames={"#v": "version"},
            ProjectionExpression="#v, updated_at, updated_by",
            ScanIndexForward=False,
            Limit=limit,
        )
        return [
            HistoryEntry(
                version=int(item["version"]["N"]),
                updated_at=item["updated_at"]["S"],
                updated_by=item["updated_by"]["S"],
            )
            for item in response.get("Items", [])
        ]

    # -- sign-in bookkeeping ------------------------------------------------

    def _fails_key(self) -> dict[str, Any]:
        return {"pk": _s(LOGIN_PK), "sk": _s(f"fails#{_window(time.time())}")}

    async def login_failures(self) -> int:
        def read() -> int:
            item = self.client.get_item(TableName=self._table, Key=self._fails_key()).get("Item")
            return int(item["attempts"]["N"]) if item else 0

        return await asyncio.to_thread(read)

    async def record_login_failure(self) -> int:
        def write() -> int:
            response = self.client.update_item(
                TableName=self._table,
                Key=self._fails_key(),
                UpdateExpression="ADD attempts :one SET expires_at = :expires",
                ExpressionAttributeValues={
                    ":one": _n(1),
                    ":expires": _n(int(time.time()) + 2 * LOGIN_WINDOW_SECONDS),
                },
                ReturnValues="UPDATED_NEW",
            )
            return int(response["Attributes"]["attempts"]["N"])

        return await asyncio.to_thread(write)

    async def clear_login_failures(self) -> None:
        await asyncio.to_thread(
            lambda: self.client.delete_item(TableName=self._table, Key=self._fails_key())
        )

    async def claim_totp_step(self, step: int) -> bool:
        def claim() -> bool:
            from botocore.exceptions import ClientError

            try:
                self.client.update_item(
                    TableName=self._table,
                    Key={"pk": _s(LOGIN_PK), "sk": _s(TOTP_SK)},
                    UpdateExpression="SET last_step = :step",
                    ConditionExpression="attribute_not_exists(last_step) OR last_step < :step",
                    ExpressionAttributeValues={":step": _n(step)},
                )
            except ClientError as err:
                if err.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                    return False
                raise
            return True

        return await asyncio.to_thread(claim)


def _decode(item: dict[str, Any]) -> StoredContent:
    return StoredContent(
        version=int(item["version"]["N"]),
        content=json.loads(item["data"]["S"]),
        updated_at=item["updated_at"]["S"],
        updated_by=item["updated_by"]["S"],
    )


def build_content_store() -> ContentStore:
    settings = get_settings()
    if settings.mock_infra:
        return MemoryContentStore()
    return DynamoContentStore(settings.content_table, settings.aws_region)
