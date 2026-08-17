# Interview stories

Real incidents from building this, written down while the details are fresh.
Specifics are what make an answer credible — "I debugged an OIDC issue" is
forgettable; "GitHub had switched to immutable subject claims and AWS won't tell
you which condition failed" is not.

Each entry: what happened, what I did, what it generalises to, and the questions
it answers.

---

## 1. The OIDC trust policy that matched nothing

**Question it answers:** *Tell me about a difficult bug.* · *How do you debug
something with no useful error message?* · *How does your pipeline authenticate
to the cloud?*

GitHub Actions could not assume its AWS role. The error was
`Not authorized to perform sts:AssumeRoleWithWebIdentity` and nothing else.

I verified everything I could reach: the role existed, the trust policy named
the right OIDC provider, the provider existed with the right URL, the audience
matched, and the subject pattern was `repo:animesh-samal/circuit-breaker:*` —
which is what every guide shows.

All correct, still failing. So I stopped reasoning about what *should* be sent
and printed what *was*: a step that requests the OIDC token, decodes the JWT
payload, and prints the claims — never the token itself, which is a bearer
credential.

The subject was:

```
repo:animesh-samal@93714349/circuit-breaker@1336345913:environment:production
```

GitHub had moved to **immutable subject claims**, embedding numeric account and
repository IDs. The reason is a genuine attack: names can be released and
re-registered, so a deleted repository or renamed organisation could let someone
else claim the name and inherit the AWS trust. Numeric IDs are never reused.

**The fix, and the part I'd defend in review:** the quick fix is
`repo:owner@*/repo@*:*`. That works — and quietly reinstates exactly the weakness
the immutable format exists to remove. I pinned the real IDs instead.

**Generalises to:** AWS deliberately does not say which condition failed, because
that would let an attacker enumerate a trust policy one probe at a time. When a
server won't explain itself, print what the client is actually sending and diff
it against what the server expects. Works for any auth failure.

---

## 2. Three rounds of Kubernetes debugging for a typo in a DNS record

**Question it answers:** *Tell me about a time you were looking in the wrong
place.* · *How do you isolate a failure across layers?*

TLS certificates wouldn't issue. cert-manager reported
`wrong status code '404', expected '200'` on the HTTP-01 challenge.

I went down the Kubernetes stack: solver ingresses existed, solver pods were
running, the issuers were ready, the CRD chain — Certificate, CertificateRequest,
Order, Challenge — had all been created correctly. I started reasoning about
Traefik routing priority and whether the HTTPS redirect middleware I'd added was
swallowing the `.well-known` path.

Then I actually read the whole response instead of the status line:

```
HTTP/1.1 404 NOT FOUND
Server: nginx/1.18.0 (Ubuntu)
```

**That isn't our nginx.** Ours is `nginx:1.27-alpine`, which reports `1.27.x` and
never says `(Ubuntu)`. Something else entirely was answering.

```
dig +short animesh.space
3.111.20.165      ← what DNS returned
3.111.200.165     ← the actual node
```

A missing zero in the A record. `3.111.20.165` is a stranger's server, and
Let's Encrypt had been faithfully fetching the challenge token from it.

Two things made the diagnosis conclusive once I stopped guessing. `curl --resolve
animesh.space:80:3.111.200.165` tests the hostname against a specific IP,
bypassing DNS entirely — it returned the correct key authorization, proving the
cluster was right all along. And `dig` versus `dig @8.8.8.8` disagreed, which
identified the remaining delay as resolver caching rather than a wrong record.

**Generalises to:** when a response is wrong, establish *which machine answered*
before theorising about why. A `Server` header, an unexpected TLS certificate, a
response time that's too fast — those identify the responder. I spent two rounds
reasoning about ingress priority on the strength of a status code alone, while
the answer sat in a header I'd read past.

---

## 3. Sizing a node from evidence rather than the free-tier page

**Question it answers:** *How do you right-size infrastructure?* · *Tell me about
a decision you changed.*

I put the cluster on a `t3.micro` because it's the free-tier size. It came up,
and the node looked fine.

Then I read the numbers instead of the status column:

```
911Mi total · 790Mi used · 120Mi available · 581Mi already in swap
```

That was k3s and its own system pods with **zero application workloads**. Two
corroborating details in the pod list I'd nearly skimmed past: `coredns` showed
`RESTARTS 1`, and the Traefik install had `Completed 4` — four attempts. Both are
what memory pressure looks like before anything crashes outright.

Our manifests requested another 224Mi against 120Mi available. It would have
"worked", in swap, producing slow and intermittent behaviour that is genuinely
miserable to diagnose — you spend a week convinced your code is slow.

Moved to `t3.small`, $7.70 → $15.50/month, and recorded the measured numbers in
the variable description so the next person sees the evidence and not just the
value.

**Generalises to:** `Ready` is not `healthy`. Restart counts and retry counts are
leading indicators; waiting for a crash means waiting for the second-worst
signal.

---

## 4. The monitoring API that would have been the largest line on the bill

**Question it answers:** *Tell me about a cost decision.* · *How do you decide a
cache TTL?*

The site shows its own month-to-date AWS spend. The obvious implementation polls
Cost Explorer periodically.

Cost Explorer bills **$0.01 per request**. Hourly polling is 720 calls a month —
$7.20, more than the EC2 instance the entire site runs on. The observability
feature would have quietly become the largest thing it was observing.

Fix: refresh once a day, serve every page view from cache. About $0.30.

**The interesting part** is what it forced. I'd been treating the TTL as a
performance knob. Here it was a spend control, and the right value came from
asking *how stale is this allowed to be* rather than *how fast should the page
feel*. Nobody needs a month-to-date total accurate to the hour; it moves slowly
by construction.

There's a test asserting a fresh cache hit does not call the upstream. If someone
"optimises" the TTL away, a test fails instead of an invoice arriving.

---

## 5. A test that failed for reasons that had nothing to do with the code

**Question it answers:** *How do you test time-dependent logic?* · *Tell me about
a flaky test.*

A circuit breaker test asserted that after `asyncio.sleep(0.06)` a breaker with a
`0.05` recovery timeout had moved to half-open. It failed. The breaker was right;
the test was wrong.

`asyncio` fires timers up to one clock-resolution **early**, and on Windows that
resolution is ~15.6ms. So `sleep(0.06)` can return after ~45ms of real time — less
than the timeout, so the breaker was correctly still open. A sibling test with
the same margin had passed, by luck. Both were flaky; I'd only seen one fail.

Three tiers of fix:

1. Widen the sleep — hides it, still slow, still probabilistic
2. Monkeypatch the module's time function — works, couples the test to an
   implementation detail
3. **Make the clock a constructor dependency** — the object is given its clock,
   production passes nothing, tests pass a fake and control time exactly

I took the third. The tests are now deterministic and exercise a 30-second
recovery window in microseconds.

**The bonus:** making the clock explicit forced a decision that had been an
accident. It's `time.monotonic`, not `time.time`, because an NTP correction can
step the wall clock backwards and make a breaker appear to have opened in the
future.

---

## 6. A dependency mismatch that hung instead of failing

**Question it answers:** *Why containers?* · *Tell me about a time you lost time
to tooling.*

`pip install -e ".[dev]"` ran for hours. Not slowly — stuck. The project declared
`requires-python = ">=3.12"`; the machine had 3.11.7, and pip was three years old.

The lesson wasn't the version mismatch. It was that **the mismatch was detectable
in milliseconds and took hours to surface.** A system that fails loudly and
immediately is worth a great deal more than one that fails slowly and silently.

Two habits came out of it. If a command produces no output for ~2 minutes it is
stuck, not slow — and the response is never to retry harder, it's to constrain it
until it's forced to fail informatively (`-v`, `--timeout`, `--only-binary`).
Second: pin the interpreter version identically in `.python-version` and the
container base image, because a local/container mismatch reintroduces the exact
class of bug containers exist to remove.

It's also the honest answer to "why containers?" — better than anything abstract.

---

## 7. Type errors the dev server could never have caught

**Question it answers:** *What does CI give you that local development doesn't?*

The frontend ran fine under `npm run dev` for days. Its first container build
failed immediately on two TypeScript errors.

Vite **transpiles** TypeScript without type-checking it — that's what makes the
dev server fast. The build runs `tsc --noEmit` first, so the pipeline caught what
the dev loop structurally could not.

Both errors came from strict settings worth knowing:
`exactOptionalPropertyTypes` distinguishes "property absent" from "property
present and `undefined`", and `noUncheckedIndexedAccess` makes `arr[i]` return
`T | undefined` because the compiler can't prove the index is in range.

**Generalises to:** know which checks your fast loop is skipping. The gap between
"it runs" and "it's correct" is exactly where CI earns its cost.

---

## 8. Changing the machine's definition instead of the machine

**Question it answers:** *What does infrastructure as code actually buy you?*

I'd disabled Traefik in the node's bootstrap script, planning to install a
different ingress controller. That was wrong: with no controller and no
`servicelb`, an `Ingress` resource has nothing to fulfil it and a `LoadBalancer`
service never gets an address. Nothing would have been reachable.

The tempting fix was to SSH in, edit the k3s systemd unit, and restart. Two
minutes, done.

I changed the Terraform template and let the instance be replaced. Four minutes,
and the running node still matches its definition. The other path leaves you with
a machine that works and a repository that lies — and the next `terraform apply`
silently reverts your fix.

`user_data_replace_on_change = true` is what makes this a rebuild rather than
drift.

---

## 9. Reading the step list instead of the error message

**Question it answers:** *How do you approach a failing pipeline?*

A release run showed `NoCredentials` in its last step. The actual failure was
four steps earlier — assume-role had failed, everything between was skipped, and
only the final step ran because I'd marked it `if: always()`.

The error I was shown was a symptom of a cause that had scrolled off screen.

**Generalises to:** in any pipeline, find the *first* red step, not the loudest
one. And `if: always()` steps need a guard — `Record the deploy` had no
credentials to record with, turning one clear failure into two confusing ones.

---

## 10. Choosing what not to test

**Question it answers:** *What's your view on code coverage?*

Coverage came in at 57% against an 80% gate. The tempting fix is to lower the
gate, which makes the gate meaningless — a threshold you move whenever it's
inconvenient measures nothing.

I split the codebase instead. The AWS and Kubernetes client modules are thin
wrappers over SDKs; unit-testing them means asserting that a mock was called with
the arguments you just passed it, which tests the mock. They're excluded from
measurement, with the reasoning written in `pyproject.toml`, and their
correctness comes from running against the real services.

What *is* measured is the code with decisions in it — the breaker state machine,
the cache, the degradation policy, the routers — and it went from untested to 87%
with tests that would actually catch a regression.

**Generalises to:** coverage percentage is a proxy. Ask what the number is
protecting before defending it.

---

## Smaller ones worth having ready

**ECR tokens expire after 12 hours.** The node pulls fine on day one and fails on
day two. There's a systemd timer refreshing credentials every 8 hours. Confusing
the first time you meet it, obvious afterwards.

**PowerShell's pipe corrupts `--password-stdin`.** `aws ecr get-login-password |
docker login` fails on Windows with a 400, because PowerShell applies its own
encoding and line ending. The class of problem — a pipe is not always a byte
stream — matters more than the workaround.

**`curl` in PowerShell is an alias for `Invoke-WebRequest`**, a different program
that doesn't understand `-s`. Use `curl.exe`.

**A Terraform dependency cycle.** Compute needed the log group's ARN for its IAM
policy; observability needed compute's instance ID for its alarms. The fix is to
find the genuinely shared resource and hoist it to the root module — not to
hand-build ARN strings to dodge the reference.

**Resource limits and rollout strategy are not independent.** On a small node,
the default `maxSurge` tries to schedule extra pods that can't fit, and the
rollout stalls forever with everything `Pending` on memory.

**`sh` is not `bash`.** SSM's `AWS-RunShellScript` runs with `/bin/sh`, which is
`dash` on Ubuntu, and `set -o pipefail` is a bashism dash doesn't implement —
`Illegal option -o pipefail`. Anything you hand to a remote executor is running
under a shell you didn't choose, so either write POSIX or invoke `bash`
explicitly. The habit of writing `#!/usr/bin/env bash` and assuming it applies
everywhere is what makes this a surprise.
