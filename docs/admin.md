# The admin panel

A place to change what the site says without touching code: add a project,
replace the CV, edit the availability line, the numbers, the experience, the
skills and the journey. You sign in at `/admin`, change things in a form, press
save, and the public site shows the change within about half a minute.

This page covers how to set it up once, how to use it, and how it is kept safe.
The screens are in the second pull request; this one is the API and the AWS side
underneath them.

## How it works, in one paragraph

Everything the site says about you is one document. The pages ship with a copy
of it built in, so the site works with no database at all. The API serves any
saved document at `/api/content`, and the pages show that instead of the built-in
copy, field by field. Every save is kept as a numbered version, so any earlier
one can be restored. The CV is a file in a private storage bucket, served at
`/api/cv`; until you upload one, that link hands out the PDF that ships with the
site.

If the database is down, or empty, the site shows its built-in content. A failure
in the admin side can never take the public pages down.

## One-time setup

You do this once. Until you have, nothing breaks: the API serves the built-in
content and the sign-in page says the panel is not set up.

**1. Create the table and the bucket.**

```
cd terraform/envs/prod
terraform plan     # read it: one table, one bucket, a few permissions
terraform apply
```

This adds a DynamoDB table (`circuit-breaker-content`), a private S3 bucket
(`animesh-circuit-breaker-uploads`) and three narrow permissions on the node's
role. If AWS says the bucket name is taken, pick another in `terraform.tfvars`
(`uploads_bucket_name = "..."`) and change `UPLOADS_BUCKET` in
`deploy/k8s/02-config.yaml` to match. Terraform is applied by hand on purpose;
see `.github/workflows/terraform.yml`.

**2. Choose your password and set up your authenticator.**

```
python backend/scripts/admin_credentials.py --put
```

It asks for a password (at least 14 characters; a few random words is best),
shows a setup key for your authenticator app, and asks you to type the code the
app shows, so you cannot lock yourself out by mistyping the key. Then it saves
everything as one encrypted AWS parameter, `/circuit-breaker/admin`. It needs only
Python and the `aws` command signed in to your account. Without `--put` it writes
a file and prints the command to run.

**3. Release.** The next release tag deploys the new API and the settings in
`02-config.yaml`. The API reads the credentials within five minutes.

## Day to day

- Sign in with the password and the current 6-digit code.
- Every change shows up on the public site within about half a minute.
- **Save** refuses if the content changed since you opened the page, for example
  from another tab, and tells you to reload. Nothing is silently overwritten.
- **History** lists every saved version. Restoring one saves it as a new version,
  so history is never rewritten.
- A session lasts 12 hours.

## If something goes wrong

| Problem | What to do |
| --- | --- |
| Lost your phone | Run `admin_credentials.py --put` again. It makes a new seed and signs everybody out. |
| Forgot the password | The same: run it again and choose a new one. |
| Locked out (five wrong tries) | Wait fifteen minutes. The count resets by itself. |
| Think someone else is signed in | Run `admin_credentials.py --put` again. Changing the credentials ends every session. |
| Saved something wrong | History, then restore the version before it. |
| Want the panel off | Delete the parameter: `aws ssm delete-parameter --name /circuit-breaker/admin`. Sign-in answers "not set up" within five minutes. |

## How it is kept safe

The panel can change the public site, so it is built assuming someone will try to
get in.

| Risk | What stops it |
| --- | --- |
| Guessing the password | Needs the password **and** a current authenticator code. The password is stored only as a slow, salted hash (scrypt). Five wrong tries locks sign-in for fifteen minutes, counted in the database so both API copies agree. Wrong password, wrong code and reused code all give the same reply after the same delay. |
| Reusing a code someone saw | A code works once. The last used step is recorded, and a code is only marked used when the password was right too, so knowing the password cannot be used to burn your code. |
| Stealing the session cookie with a script | The cookie is `HttpOnly`, so page scripts cannot read it. |
| Another website making your browser send a change | The cookie is `SameSite=Strict`, every change also needs a token that only the signed-in page knows, and a request naming a different origin is refused. |
| Putting a malicious link on the site | Links must be `https://` or a path on this site. `javascript:` and similar are rejected before saving, and again when an old version is restored. |
| A huge or fake CV upload | PDF only, checked by its first bytes, 5 MB at most, read as it arrives so a lying size cannot fill memory. The download name is fixed, never taken from the upload. |
| Overwriting a newer edit | Every save names the version it started from and is refused if that is out of date. |
| A leaked database or bucket | Neither holds a password or a secret. The bucket is private, encrypted and refuses non-TLS requests. |
| Stored credentials leaking from the cluster | There is no Kubernetes Secret. The credentials are an encrypted AWS parameter the API reads through the node's role. |
| The API doing more than it should | Its role can read and write one table, read and write objects in one bucket, and read one parameter. CI's deploy role gets nothing new. |

What it does not protect against: someone with control of your AWS account, or of
your phone and your password at once. A stolen session cookie stays valid until it
expires (12 hours); changing the credentials ends it at once.

## What it costs

Effectively nothing. The table adds 5 + 5 of the 25 free read and write units, the
bucket holds a few hundred kilobytes, and the parameter is the free standard kind.

## Trying it locally

With no AWS account, run the API in mock mode with throwaway credentials:

```
cd backend
MOCK_INFRA=true ADMIN_COOKIE_SECURE=false \
  ADMIN_DEV_PASSWORD="any long phrase" \
  ADMIN_DEV_TOTP_SECRET="$(python -c 'from app.core.security import random_totp_secret as r; print(r())')" \
  uvicorn app.main:app --port 8000
```

Everything is kept in memory and disappears when the API stops. These variables
are read only in mock mode and are ignored everywhere else.
