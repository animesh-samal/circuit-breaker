"""Primitives for the admin sign-in: a password check, one-time codes and signed
sessions.

Standard library only, on purpose. Authentication is the one place where a
dependency is a larger risk than a small amount of well-known code: each of
these is a few lines of a published standard (scrypt, RFC 6238, HMAC), and every
line is covered by a test against the standard's own test vectors.

What is deliberately absent: there is no server-side session table. A session is
a signed, expiring token, so two API replicas agree about who is signed in
without sharing anything but the signing key. The cost is that a stolen cookie
stays valid until it expires; rotating the session key in the admin parameter
ends every session at once, which is the revocation story.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import struct
import time
from dataclasses import dataclass

# scrypt settings. N=2**14, r=8 uses 16 MiB per hash, which fits comfortably in
# the API container's memory limit while making each guess expensive. The values
# are stored inside the hash string, so they can be raised later without
# invalidating the stored password.
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
_DKLEN = 32
# A corrupted or hostile parameter string must not be able to ask for gigabytes.
_MAX_SCRYPT_N = 2**17
_MAX_MEMORY = 256 * 1024 * 1024


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------


def hash_password(
    password: str,
    *,
    salt: bytes | None = None,
    n: int = SCRYPT_N,
    r: int = SCRYPT_R,
    p: int = SCRYPT_P,
) -> str:
    """Return `scrypt$n$r$p$salt$hash`. A fresh random salt unless one is given."""
    salt = salt if salt is not None else secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=_DKLEN, maxmem=_MAX_MEMORY
    )
    return f"scrypt${n}${r}${p}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    """True if `password` matches `stored`. Never raises on a malformed hash."""
    try:
        scheme, n, r, p, salt, expected = stored.split("$")
        if scheme != "scrypt" or int(n) > _MAX_SCRYPT_N:
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=unb64(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=_DKLEN,
            maxmem=_MAX_MEMORY,
        )
        return hmac.compare_digest(digest, unb64(expected))
    except (ValueError, TypeError):
        return False


# ---------------------------------------------------------------------------
# One-time codes (RFC 6238, the six-digit codes an authenticator app shows)
# ---------------------------------------------------------------------------

TOTP_STEP = 30
TOTP_DIGITS = 6


def random_totp_secret() -> str:
    """A new base32 seed, 160 bits, in the form authenticator apps accept."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii")


def totp_code(secret_b32: str, counter: int, digits: int = TOTP_DIGITS) -> str:
    """The code for one 30-second step."""
    clean = secret_b32.strip().replace(" ", "").upper()
    key = base64.b32decode(clean + "=" * (-len(clean) % 8))
    mac = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = mac[-1] & 0x0F
    value = struct.unpack(">I", mac[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**digits).zfill(digits)


def verify_totp(
    secret_b32: str,
    code: str,
    *,
    now: float | None = None,
    window: int = 1,
    digits: int = TOTP_DIGITS,
) -> int | None:
    """Return the step number the code belongs to, or None if it is wrong.

    The step is returned, not just a yes, so the caller can refuse to accept the
    same step twice: a code that was just used to sign in and is shown over a
    shoulder or read from a log must not work a second time.

    `window` allows one step either side for clock drift between the phone and
    the server. Every candidate is compared, without stopping at the first match,
    so the time taken does not hint at which step matched.
    """
    code = code.strip().replace(" ", "")
    if len(code) != digits or not code.isdigit():
        return None
    current = int((time.time() if now is None else now) // TOTP_STEP)
    matched: int | None = None
    for delta in range(-window, window + 1):
        step = current + delta
        if hmac.compare_digest(totp_code(secret_b32, step, digits), code):
            matched = step
    return matched


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

_SESSION_VERSION = "v1"


@dataclass(frozen=True)
class Session:
    subject: str
    issued_at: int
    expires_at: int
    # Sent back in a header on every change. A page on another site cannot read
    # it, so it cannot forge a request even though the browser would attach the
    # cookie.
    csrf: str


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def _signature(key: bytes, body: str) -> str:
    return _b64(hmac.new(key, body.encode("ascii"), hashlib.sha256).digest())


def sign_session(key: bytes, session: Session) -> str:
    payload = _b64(
        json.dumps(
            {
                "sub": session.subject,
                "iat": session.issued_at,
                "exp": session.expires_at,
                "csrf": session.csrf,
            },
            separators=(",", ":"),
        ).encode("utf-8")
    )
    body = f"{_SESSION_VERSION}.{payload}"
    return f"{body}.{_signature(key, body)}"


def read_session(key: bytes, token: str, *, now: float | None = None) -> Session | None:
    """The session inside `token`, or None if it is forged, damaged or expired."""
    try:
        version, payload, signature = token.split(".")
        if version != _SESSION_VERSION:
            return None
        if not hmac.compare_digest(_signature(key, f"{version}.{payload}"), signature):
            return None
        data = json.loads(unb64(payload))
        session = Session(
            subject=str(data["sub"]),
            issued_at=int(data["iat"]),
            expires_at=int(data["exp"]),
            csrf=str(data["csrf"]),
        )
    except (ValueError, KeyError, TypeError):
        return None
    if (time.time() if now is None else now) >= session.expires_at:
        return None
    return session
