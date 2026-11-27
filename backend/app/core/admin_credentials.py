"""The admin sign-in credentials, and where they come from.

Three values are needed: a hash of the password, the seed behind the authenticator
codes, and the key that signs sessions. They live together in one encrypted AWS
parameter, written once by `backend/scripts/admin_credentials.py`.

Why a parameter and not a Kubernetes Secret: this project has no Secrets on
purpose (see deploy/k8s/02-config.yaml). Credentials that are issued at runtime
and never stored in the cluster cannot be read out of it, copied into a backup
or committed by accident. The API reads this one through the node's instance
profile and holds it in memory for a few minutes.

If the parameter does not exist, the admin panel is simply off: sign-in answers
"not set up" and nothing else changes. That is also why deploying this code
before running the setup is safe.
"""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
import time
from dataclasses import dataclass

from app.clients.aws import aws
from app.core.config import get_settings
from app.core.security import hash_password, unb64

logger = logging.getLogger(__name__)

CACHE_SECONDS = 300.0
MIN_SESSION_KEY_BYTES = 32


@dataclass(frozen=True)
class AdminCredentials:
    password_hash: str
    totp_secret: str
    session_key: bytes


_cache: tuple[float, AdminCredentials | None] | None = None
_lock = asyncio.Lock()
# Local development only: one random key per process, so a restart signs
# everyone out, and nothing is written anywhere.
_dev_session_key = secrets.token_bytes(32)


def reset_credentials_cache() -> None:
    global _cache
    _cache = None


def parse_credentials(raw: str) -> AdminCredentials | None:
    """Turn the parameter's JSON into credentials, or None if it is not usable.

    A damaged parameter is treated as "not set up" and logged loudly, rather than
    raising on every request: the public site must never depend on this.
    """
    try:
        data = json.loads(raw)
        creds = AdminCredentials(
            password_hash=str(data["password_hash"]),
            totp_secret=str(data["totp_secret"]),
            session_key=unb64(str(data["session_key"])),
        )
    except (ValueError, KeyError, TypeError):
        logger.error("admin parameter is not valid JSON with the expected keys")
        return None
    if len(creds.session_key) < MIN_SESSION_KEY_BYTES:
        logger.error("admin session key is shorter than %d bytes", MIN_SESSION_KEY_BYTES)
        return None
    return creds


async def _load() -> AdminCredentials | None:
    settings = get_settings()
    if settings.mock_infra:
        if not (settings.admin_dev_password and settings.admin_dev_totp_secret):
            return None
        return AdminCredentials(
            password_hash=await asyncio.to_thread(hash_password, settings.admin_dev_password),
            totp_secret=settings.admin_dev_totp_secret,
            session_key=_dev_session_key,
        )
    raw = await aws.get_secure_parameter(settings.admin_param)
    return parse_credentials(raw) if raw else None


async def load_credentials() -> AdminCredentials | None:
    """The credentials, cached briefly. None means the admin panel is off."""
    global _cache
    now = time.monotonic()
    if _cache is not None and now - _cache[0] < CACHE_SECONDS:
        return _cache[1]
    async with _lock:
        if _cache is not None and time.monotonic() - _cache[0] < CACHE_SECONDS:
            return _cache[1]
        try:
            creds = await _load()
        except Exception:
            # AWS is unreachable or the role lacks access. Keep the admin panel
            # closed, say why in the log, and try again on the next request.
            logger.exception("could not read the admin parameter")
            return None
        _cache = (time.monotonic(), creds)
        return creds
