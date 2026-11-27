#!/usr/bin/env python3
"""Create (or replace) the admin panel's sign-in credentials.

Asks for a password, makes an authenticator seed and a session key, checks that
your authenticator app really produces the right codes, and saves all three as
one encrypted AWS parameter that the API reads. Run it again at any time to
change the password, move to a new phone, or sign everybody out.

    python backend/scripts/admin_credentials.py --put

Needs only Python 3.12 or newer. `--put` also needs the `aws` command line tool
signed in to the account. Without `--put` the value is written to a file and the
exact command to save it is printed.

Nothing secret is ever printed except the authenticator seed, once, because the
app has to be given it. The password is typed without being shown, and the value
goes to AWS through a private temporary file, not the command line, where it
would be visible to other programs on the machine.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
from pathlib import Path

# The same code the API uses, so what this checks is exactly what the API checks.
# Standard library only, so no install is needed first.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.security import hash_password, random_totp_secret, verify_totp

MIN_PASSWORD_LENGTH = 14


def ask_password() -> str:
    while True:
        first = getpass.getpass("Choose a password (not shown): ")
        if len(first) < MIN_PASSWORD_LENGTH:
            print(f"Use at least {MIN_PASSWORD_LENGTH} characters. A few random words is best.")
            continue
        if getpass.getpass("Type it again: ") != first:
            print("Those did not match. Try again.")
            continue
        return first


def confirm_authenticator(secret: str) -> bool:
    for attempt in range(1, 4):
        code = input(f"Enter the 6-digit code your app shows now ({attempt}/3): ").strip()
        if verify_totp(secret, code) is not None:
            return True
        print("That code is not right. Check the phone's clock and try the next code.")
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Create the admin panel's sign-in credentials.")
    parser.add_argument("--param", default="/circuit-breaker/admin", help="AWS parameter name")
    parser.add_argument("--region", default="ap-south-1")
    parser.add_argument("--issuer", default="animesh.space", help="name shown in the app")
    parser.add_argument("--account", default="admin", help="account label shown in the app")
    parser.add_argument("--put", action="store_true", help="save to AWS with the aws command")
    parser.add_argument("--out", default="admin-credentials.json", help="file without --put")
    args = parser.parse_args()

    password = ask_password()
    totp_secret = random_totp_secret()
    uri = "otpauth://totp/{}:{}?{}".format(
        urllib.parse.quote(args.issuer),
        urllib.parse.quote(args.account),
        urllib.parse.urlencode(
            {
                "secret": totp_secret,
                "issuer": args.issuer,
                "algorithm": "SHA1",
                "digits": 6,
                "period": 30,
            }
        ),
    )

    print("\nAdd this to your authenticator app (Google Authenticator, 1Password, Authy...).")
    print("Choose 'enter a setup key' and paste the key, or open the link on your phone:\n")
    print(f"  Key:   {totp_secret}")
    print(f"  Link:  {uri}\n")
    if not confirm_authenticator(totp_secret):
        print("Nothing was saved. Run the script again once the app shows matching codes.")
        return 1

    value = json.dumps(
        {
            "password_hash": hash_password(password),
            "totp_secret": totp_secret,
            "session_key": secrets.token_urlsafe(32),
        }
    )

    if args.put:
        aws_cli = shutil.which("aws")
        if aws_cli is None:
            print("\nThe aws command line tool was not found. Run without --put instead.")
            return 1
        # A private temporary file, so the value never appears in a process list.
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            os.chmod(handle.name, 0o600)
            handle.write(value)
        try:
            subprocess.run(  # noqa: S603 - a fixed command; the only inputs are the flags above
                [
                    aws_cli,
                    "ssm",
                    "put-parameter",
                    "--name",
                    args.param,
                    "--type",
                    "SecureString",
                    "--overwrite",
                    "--region",
                    args.region,
                    "--description",
                    "Sign-in credentials for the admin panel",
                    "--value",
                    f"file://{handle.name}",
                ],
                check=True,
            )
        except (OSError, subprocess.CalledProcessError) as err:
            print(f"\nCould not save to AWS: {err}\nNothing was changed.")
            return 1
        finally:
            Path(handle.name).unlink(missing_ok=True)
        print(f"\nSaved to {args.param}. The API picks it up within five minutes.")
        print("Every earlier sign-in is now ended.")
        return 0

    out = Path(args.out)
    out.write_text(value)
    out.chmod(0o600)
    print(f"\nWritten to {out}. Save it to AWS, then delete the file:\n")
    print(
        f"  aws ssm put-parameter --name {args.param} --type SecureString --overwrite "
        f"--region {args.region} --value file://{out}"
    )
    print(f"  rm {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
