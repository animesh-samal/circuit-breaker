"""Sign-in primitives, checked against the standards they implement.

The one-time codes are compared with the test vectors published in RFC 6238
(appendix B), so a mistake in the algorithm cannot hide behind tests that were
written from the same misunderstanding.
"""

import base64

import pytest

from app.core.security import (
    Session,
    hash_password,
    new_csrf_token,
    random_totp_secret,
    read_session,
    sign_session,
    totp_code,
    verify_password,
    verify_totp,
)

# The RFC's seed is the ASCII string 12345678901234567890.
RFC_SECRET = base64.b32encode(b"12345678901234567890").decode()


# -- passwords ---------------------------------------------------------------


def test_a_password_verifies_against_its_own_hash() -> None:
    stored = hash_password("correct horse")
    assert verify_password("correct horse", stored)


def test_a_wrong_password_is_refused() -> None:
    assert not verify_password("wrong", hash_password("correct horse"))


def test_the_same_password_hashes_differently_each_time() -> None:
    assert hash_password("same") != hash_password("same")


def test_the_hash_records_its_own_parameters() -> None:
    scheme, n, r, p, *_ = hash_password("x").split("$")
    assert (scheme, int(n), int(r), int(p)) == ("scrypt", 2**14, 8, 1)


@pytest.mark.parametrize(
    "stored",
    [
        "",
        "nonsense",
        "scrypt$only$three$parts",
        "bcrypt$16384$8$1$c2FsdA$aGFzaA",
        "scrypt$notanumber$8$1$c2FsdA$aGFzaA",
        # A hash that asks for an absurd amount of memory must be refused, not tried.
        "scrypt$4294967296$8$1$c2FsdA$aGFzaA",
    ],
)
def test_a_malformed_stored_hash_is_refused_without_raising(stored: str) -> None:
    assert not verify_password("anything", stored)


# -- one-time codes ------------------------------------------------------------


@pytest.mark.parametrize(
    ("seconds", "eight_digit_code"),
    [
        (59, "94287082"),
        (1111111109, "07081804"),
        (1111111111, "14050471"),
        (1234567890, "89005924"),
        (2000000000, "69279037"),
        (20000000000, "65353130"),
    ],
)
def test_codes_match_the_rfc_6238_vectors(seconds: int, eight_digit_code: str) -> None:
    assert totp_code(RFC_SECRET, seconds // 30, digits=8) == eight_digit_code


def test_six_digit_codes_are_the_tail_of_the_eight_digit_ones() -> None:
    assert totp_code(RFC_SECRET, 59 // 30) == "287082"


def test_a_current_code_is_accepted_and_reports_its_step() -> None:
    now = 1_700_000_000
    code = totp_code(RFC_SECRET, now // 30)
    assert verify_totp(RFC_SECRET, code, now=now) == now // 30


def test_a_code_one_step_old_or_new_is_accepted_for_clock_drift() -> None:
    now = 1_700_000_000
    assert verify_totp(RFC_SECRET, totp_code(RFC_SECRET, now // 30 - 1), now=now) == now // 30 - 1
    assert verify_totp(RFC_SECRET, totp_code(RFC_SECRET, now // 30 + 1), now=now) == now // 30 + 1


def test_a_code_two_steps_away_is_refused() -> None:
    now = 1_700_000_000
    assert verify_totp(RFC_SECRET, totp_code(RFC_SECRET, now // 30 - 2), now=now) is None


@pytest.mark.parametrize("code", ["", "12345", "1234567", "abcdef", "12 34 5"])
def test_codes_of_the_wrong_shape_are_refused(code: str) -> None:
    assert verify_totp(RFC_SECRET, code, now=1_700_000_000) is None


def test_spaces_in_a_code_are_ignored() -> None:
    now = 1_700_000_000
    code = totp_code(RFC_SECRET, now // 30)
    assert verify_totp(RFC_SECRET, f"{code[:3]} {code[3:]}", now=now) == now // 30


def test_a_new_secret_is_valid_base32_of_the_right_size() -> None:
    secret = random_totp_secret()
    assert len(base64.b32decode(secret)) == 20
    assert secret != random_totp_secret()


# -- sessions ------------------------------------------------------------------

KEY = b"k" * 32


def _session(**overrides: object) -> Session:
    base = {"subject": "admin", "issued_at": 1000, "expires_at": 2000, "csrf": "token"}
    return Session(**{**base, **overrides})  # type: ignore[arg-type]


def test_a_signed_session_reads_back() -> None:
    session = _session()
    assert read_session(KEY, sign_session(KEY, session), now=1500) == session


def test_an_expired_session_is_refused() -> None:
    assert read_session(KEY, sign_session(KEY, _session()), now=2000) is None


def test_a_session_signed_with_another_key_is_refused() -> None:
    assert read_session(b"x" * 32, sign_session(KEY, _session()), now=1500) is None


def test_a_tampered_payload_is_refused() -> None:
    version, _payload, signature = sign_session(KEY, _session()).split(".")
    forged = (
        base64.urlsafe_b64encode(b'{"sub":"admin","iat":1000,"exp":9999999999,"csrf":"token"}')
        .decode()
        .rstrip("=")
    )
    assert read_session(KEY, f"{version}.{forged}.{signature}", now=1500) is None


@pytest.mark.parametrize("token", ["", "a.b", "a.b.c.d", "v2.cGF5bG9hZA.c2ln", "v1..", "...."])
def test_a_malformed_token_is_refused_without_raising(token: str) -> None:
    assert read_session(KEY, token, now=1500) is None


def test_csrf_tokens_are_unique_and_long() -> None:
    first, second = new_csrf_token(), new_csrf_token()
    assert first != second
    assert len(first) >= 40
