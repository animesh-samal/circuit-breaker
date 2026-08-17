# Decisions

Every non-obvious choice in this project, the alternatives considered, and what
each one cost. Substantial decisions also have a full ADR in `docs/adr/`; this is
the index and the record for everything smaller.

Format: **Decision** — what was rejected — why — what we accepted in return.

---

## Project and process

**Do not reuse the SmartFlow name.** SmartFlow is work product, built on company
time for a company system. Reusing the name on a public personal repository
muddies ownership regardless of whether any code is shared. Cost: none. This
project shares no identifiers with it.

**A portfolio site as the vehicle, rather than a contrived demo app.** Rejected:
a generic todo/e-commerce demo. The site has to exist anyway, and infrastructure
that runs something real is more defensible than infrastructure that runs a
placeholder. Cost: the site's own requirements sometimes conflict with the
cleanest infrastructure story.

**Build complete locally, then deploy.** Originally a walking skeleton — thinnest
end-to-end slice deployed on day one. Changed on request to build everything and
then deploy. Cost accepted knowingly: the first deployment had more moving parts
failing simultaneously than it needed to.

**Monorepo.** Rejected: separate repositories per component, which is standard at
scale because repository boundaries mirror team ownership. The deciding factor
was legibility — this repository *is* a portfolio artifact, and splitting it
would hide the relationship it exists to show. Cost: CI needs path filtering, or
a README edit rebuilds everything. See ADR-0001.

**ADRs for substantial decisions.** Rejected: comments alone. Cost: discipline.
The return is that "why did you choose X" has a written answer instead of a
reconstructed one.

---

## Frontend

**Two containers: nginx for static assets, FastAPI for the API.** Rejected:
FastAPI serving the built files itself (simplest, one deployment, couples
frontend releases to backend releases); S3 + CloudFront (the correct production
answer — cheaper, faster, infinitely scalable). Chose two containers because
Kubernetes is the largest gap this project exists to close, and it's the only
arrangement producing two workloads, path-based ingress routing, and
independently scalable services. Cost: ~25MB extra memory, and an honest
acknowledgement that production belongs on a CDN. See ADR-0002.

**Vite + React + TypeScript, no UI framework.** Rejected: Next.js (implies SSR
and a Node server at runtime — more to run, more to secure, no benefit for a
static site). Cost: no SSR, so no server-rendered SEO.

**No chart library.** Rejected: Recharts or Chart.js, 90–180KB gzipped for what
is a polyline and a fill. Hand-rolled SVG sparklines are ~40 lines. Cost: no
axes, tooltips, or legends without writing them.

**Hand-rolled icons.** Rejected: lucide-react (~60KB for the seven glyphs used)
or an icon font (a network request and a FOUT). Seven inline SVGs are about 1KB
and let the stroke weight be tuned to the type. Cost: adding an eighth is manual.

**CSS 3D transforms, not Three.js.** For the rotating pod cubes. Rejected: WebGL,
which would add ~600KB, drain phone batteries, and need a fallback for machines
without hardware acceleration — to render rotating cubes. `preserve-3d` animates
on the compositor and inherits theme variables. Cost: no real 3D beyond simple
solids.

**Theme system as CSS custom properties on `[data-theme]`.** Five themes; a sixth
is one CSS block and one array entry. Rejected: separate stylesheets per theme
(duplicated rules, drift), or a CSS-in-JS runtime. Cost: `color-mix()` is
required for derived tints — fine in current browsers, not in old ones.

**Theme applied by an inline script before React mounts.** Otherwise the page
paints in the default theme and snaps to the stored one, which reads as a bug.
Cost: a small blocking script in `<head>`.

**Text left-aligned inside centred containers.** Briefly centred the text itself
on request, then reverted after seeing it: centred prose leaves a ragged left
edge and the eye has to hunt for each line's start. Cost: none.

**Sidebar navigation, becoming a sticky horizontal strip on mobile.** Rejected: a
bottom tab bar (six items exceed the four-or-five practical limit, and it makes a
portfolio feel like an app); a hamburger menu (hides navigation behind a tap).
Same DOM in both layouts, re-flowed by CSS. Cost: one media query.

**Indicator lamps carry real state.** The Infrastructure lamp polls
`/api/breakers` and shows green, amber or red for actual system health rather
than merely echoing which page is open. A light meaning "you clicked this" is a
second highlight; a light meaning "the cluster is degraded" is information.

**Utility box readouts fetched on first expand, not on page load.** Most visitors
never open it, and `/api/cost` ultimately reaches a billed API. Uses
`Promise.allSettled`, so one failing endpoint degrades a single field rather than
blanking the panel.

**No CORS, anywhere.** The frontend only ever calls relative `/api/...` paths —
Vite proxies in development, nginx routes in production. The browser never makes
a cross-origin request. Rejected: a configurable API base URL, which is more
flexible and adds a category of misconfiguration.

**`AbortController` timeout on every fetch.** The browser's default is
effectively forever, so a hung backend leaves the UI spinning indefinitely.

**Blog posts as a local module.** Rejected: a CMS, or a database-backed editor.
Multi-author publishing needs accounts, sessions, an editor, draft state and an
authorisation model — an application, not a page. The component reads a `Post`
type, so the array becomes an API response later without touching the UI.

---

## Backend

**FastAPI application factory with a lifespan context manager.** Rejected: a
module-level `app = FastAPI()` (tests import whatever global state existed at
import time) and `@app.on_event` (deprecated, and splits startup from shutdown).
Cost: one layer of indirection.

**pydantic-settings for configuration.** Rejected: `os.getenv` scattered through
the code. Gives typed, validated, centrally-declared config — and one place to
read when writing the Kubernetes ConfigMap. Cost: a dependency.

**Liveness checks nothing; readiness checks only non-degradable dependencies.**
Rejected: both probes verifying all dependencies (an upstream blip then restarts
every replica simultaneously, discarding warm caches and stampeding a service
already in trouble); readiness verifying all dependencies (Cost Explorer being
slow would take every pod out of rotation despite the site being 95%
functional). The governing question is "can this pod do useful work without it?"
Consequence: readiness is currently near-identical to liveness, which is correct
for a service with no non-degradable dependencies. See ADR-0003.

**Circuit breaker written by hand.** Rejected: `pybreaker`, `purgatory`. Breaker
state is a *feature* here — the UI renders it live — so first-class access to
state, timings and counters is needed. For a service where the breaker were mere
infrastructure, the library is the right call. Cost: a state machine to maintain
and test.

**Trip on consecutive failures, not a rolling error rate.** A rolling window is
more robust under mixed traffic, where one slow endpoint among many healthy ones
can trip a shared breaker. At this request volume a consecutive counter is
adequate and far easier to reason about. Recorded rather than hidden.

**One breaker per upstream.** A shared breaker would mean Cost Explorer failing
stops calls to CloudWatch — unrelated services coupled by an implementation
detail, which is the opposite of the pattern's purpose.

**The cache retains expired entries instead of evicting them.** This is what
makes graceful degradation possible; deleting on expiry throws away the only
fallback available when an upstream is down. Counterintuitive enough that there's
a test guarding it against future tidying.

**In-process cache, not Redis.** Redis is correct for shared cache state and
wrong here — a StatefulSet, a network hop, and a new failure mode for a workload
on one node with no coherence requirement. Cost: replicas can hold different
values, acceptable because every cached value is observational.

**Every response carries provenance.** `source`, `degraded`, `age_seconds`,
`breaker_state`. Rejected: a plain payload, which forces the UI to guess whether
it's showing current data. Serving stale data *while saying so* is fine; serving
it silently is worse than an error, because it removes the reader's ability to
tell anything is wrong.

**Mock mode gated behind a setting defaulting to false, and always labelled.**
Every mock response carries `mock: true` through to a visible banner. Fake
telemetry indistinguishable from real telemetry is a liability — during an
incident it's the difference between "the system is fine" and "I'm looking at a
fixture."

**Four independent guards on the chaos endpoint.** RBAC scoped to pod deletion in
one namespace; a replica floor refusing to take the last healthy pod; a rate
limit; a kill switch. Only the first is load-bearing — the browser confirmation
is a courtesy, because a button is not a security boundary. Known compromise: the
rate limit is per-process, so N replicas allow N deletions per window. Correct fix
is DynamoDB; with the replica floor the residual risk is a few extra reschedules.

**Every SDK call goes through `asyncio.to_thread`.** Both `boto3` and the
Kubernetes client are synchronous. A blocking call in an async handler stalls the
event loop for every concurrent request — including `/api/health`, so the
container gets restarted by its own liveness probe for the crime of calling AWS.

**The circuit breaker takes an injected clock.** Rejected: sleeping in tests
(slow and probabilistically flaky); monkeypatching the module's time function
(works, couples tests to an implementation detail). Also forced an explicit choice
of `time.monotonic` over `time.time`, since an NTP correction can step the wall
clock backwards.

**Deleted the unused Pydantic `Envelope` model.** It was never used as a
`response_model`, so it duplicated the contract without enforcing it — worse than
not having one. The shape is documented where its only consumer reads it.

---

## Containers

**Multi-stage builds for both images.** The builder installs dependencies into a
virtualenv (Python) or compiles the bundle (Node); the runtime stage copies only
the result. Keeps ~400MB of Node toolchain and all of pip out of production.

**Non-root with a fixed numeric UID.** Root in a container is root on the host if
anything escapes, and a numeric UID lets Kubernetes assert `runAsNonRoot` without
resolving a name.

**Build provenance injected as build args, never read from git at runtime.** The
image has no git binary and no `.git` directory, so `git rev-parse` would fail —
and an image should describe itself identically wherever it runs. A version
endpoint that can lie is worse than no version endpoint. Copying `.git` in would
also ship full history including any credential ever committed.

**`CMD` in exec form, not shell form.** Shell form wraps the process in `/bin/sh`,
which doesn't forward `SIGTERM` — the container would be `SIGKILL`ed after the
grace period and drop in-flight requests on every deploy.

**Plain `uvicorn`, not `uvicorn[standard]`.** The extra pulls in `httptools`,
`watchfiles` and `uvloop` — compiled C and Rust packages that add install
fragility and buy nothing at this scale.

**Python 3.12 pinned in `.python-version`, `requires-python`, and the base
image.** Whatever the number is, it must be the same number in all three places.

---

## Kubernetes

**k3s, not EKS.** EKS charges ~$73/month for the control plane before a single
node exists — fifteen times this project's budget. k3s is CNCF-conformant: same
API, same manifests, same `kubectl`. Cost, stated plainly: no managed control
plane, so the cluster dies with the node; no multi-AZ; upgrades are manual; etcd
replaced with SQLite. Every one of those is disqualifying for production and none
of them matters for learning the primitives.

**Traefik and servicelb kept enabled.** Reversal of an earlier decision to disable
them and bring our own controller. Without either, an `Ingress` has nothing to
fulfil it and a `LoadBalancer` service never gets an address. Vendoring
ingress-nginx is ~700 lines of fragile YAML for no gain on one node. The Ingress
manifests are controller-agnostic; only `ingressClassName` would change.

**`Role`, not `ClusterRole`.** The API can read pods and delete them in one
namespace, and nothing else. A `ClusterRole` with the same verbs grants them
across every namespace — the usual way this is done wrong. This is what makes a
publicly reachable chaos endpoint defensible.

**No `Secret` objects at all.** AWS access comes from the node's instance
profile, Kubernetes access from the ServiceAccount token — both issued at runtime,
both short-lived. A Secret would be a credential that can leak.

**`readOnlyRootFilesystem: true`, with `emptyDir` for paths that need writing.**

**Startup probe ahead of liveness.** A slow start and a hang look identical to a
liveness probe; without a startup probe a 40-second cold start gets restarted
forever.

**`preStop` sleep before shutdown.** Endpoint removal is eventually consistent —
kube-proxy updates rules on every node while traffic is still arriving. Failing
readiness is not enough on its own; the sleep is what actually delivers
zero-downtime deploys.

**`maxSurge: 1`, not the default.** On a small node, surging extra pods leaves
them `Pending` on memory and the rollout stalls forever. Resource limits and
rollout strategy are not independent knobs.

**HPA with a 300-second scale-down stabilisation window.** Without it a brief dip
scales in and the next spike scales back out, and every cycle costs a cold start.

**PodDisruptionBudget with `minAvailable: 1`.** Protects against *voluntary*
disruption — drains and evictions. It does not stop the chaos endpoint, which
deletes a pod directly; that's the replica floor's job.

**`topologySpreadConstraints` with `ScheduleAnyway`.** A no-op on one node that
costs nothing and becomes correct for free when a second node appears.

---

## Terraform and AWS

**Remote state in S3 with `use_lockfile`.** Rejected: local state (not shared, not
locked, not versioned); a DynamoDB lock table (the classic answer, still what most
interview questions expect and what most existing codebases use, now deprecated
in favour of a conditional write in S3). The concept — stop two applies
interleaving — is what matters; the mechanism moved.

**A separate bootstrap stack with local state.** Remote state needs a bucket and
the bucket needs creating by something. Applied once, then left alone. Its own
state file matters little; the two resources could be imported back in minutes.

**The VPC built by hand rather than using the default.** Subnets, route tables and
internet gateways are asked about constantly, and wiring them once is worth more
than reading about them ten times. The route table is the classic trap: an
internet gateway attached to a VPC does nothing without `0.0.0.0/0` routed to it.

**No NAT gateway.** ~$32/month plus data processing — more than everything else
combined. Production puts workloads in private subnets behind NAT, or uses VPC
endpoints for AWS-service traffic. Public subnet plus a security group here.
Stated, not hidden.

**Security group rules as separate resources, not inline blocks.** Inline blocks
are authoritative: any rule added out-of-band is silently removed on the next
apply, and rules can't change without replacing the group.

**IMDSv2 required.** Version 1 answers an unauthenticated GET, so any SSRF in a
workload can read the node's temporary credentials. Standard finding in any AWS
security review.

**ECR tags immutable, with a lifecycle policy.** A version number identifies
exactly one image forever, so a rollback to `v1.2.0` cannot quietly deploy
something else. Lifecycle expiry because ECR bills for storage and every image
ever built otherwise stays until someone notices.

**DynamoDB in provisioned mode, not on-demand.** The always-free tier covers 25
read and 25 write units in *provisioned mode only*; on-demand bills from the
first read. The "simpler" choice appears on every invoice.

**GitHub Actions authenticates by OIDC; no access keys exist anywhere.** Rejected:
an IAM user with a long-lived access key in repository secrets — a permanent
credential in a system every repo admin can reach, which nobody rotates.

**The OIDC subject condition accepts both formats, with numeric IDs pinned.**
GitHub emits `repo:owner@ID/repo@ID:...` as well as the legacy
`repo:owner/repo:...`. Wildcarding the IDs works and reinstates exactly the
weakness immutable subjects exist to remove. See interview-stories #1.

**`ssm:SendCommand` scoped by resource tag, not instance ID.** A hardcoded ID
stops matching the moment the node is replaced, and fails at deploy time rather
than apply time — the worst place to find out.

**The CloudWatch log group lives in the root module.** Compute needs its ARN for
an IAM policy; observability needs compute's instance ID for alarms. That's a
cycle. The fix is to hoist the genuinely shared resource, not to hand-build ARN
strings to dodge the reference.

**`t3.small`, sized from measurement.** `t3.micro` was tried and does not work:
790MiB used and 580MiB swapped with only k3s running. Recorded in the variable
description so the next reader sees evidence, not a value.

**2GB of swap on the node.** A lab affordance, not a production practice —
swapping a latency-sensitive workload turns a fast service into a slow one. The
honest alternative is a larger instance, which doubles the bill.

**Budget alert at $15, not $5.** The run rate is ~$21; an alarm below it fires
every month and gets ignored. An alarm should mean *something is wrong*, not *the
project is running*.

**`user_data_replace_on_change = true`.** A bootstrap script change rebuilds the
machine from its new definition rather than leaving it drifted.

**`lifecycle { ignore_changes = [ami] }` on the instance.** A new Ubuntu release
should not silently rebuild the cluster on an unrelated apply.

---

## CI/CD

**Three workflows with three permission sets.** CI is `contents: read` and touches
AWS not at all. Terraform runs `-backend=false` and needs nothing. Only Release
gets `id-token: write`. A workflow with no credentials cannot leak any.

**Tags deploy; merges to main do not.** Green main ships nothing. Publishing is a
deliberate act, which is what makes rollback meaningful — every deploy maps to
exactly one immutable tag.

**Path filtering via `dorny/paths-filter`.** The cost of the monorepo, paid
explicitly. A README edit rebuilds nothing.

**`npm ci`, not `npm install`.** `ci` installs exactly what the lockfile says and
fails if it disagrees with `package.json`. `install` silently resolves new
versions, so CI can pass against dependencies that never existed on any
developer's machine.

**Trivy with `ignore-unfixed`.** A CVE with no available fix is noise, not a gate
— blocking on it teaches people to bypass the scanner.

**gitleaks runs on everything, always, with full history.** The one check whose
value comes from never being skipped.

**Deploys go through SSM, not an exposed Kubernetes API.** The API server stays
bound to localhost and there is no kubeconfig in GitHub.

**The deploy record is written on failure too.** A history that only records
successes lies about your failure rate — the number you most want when something
breaks at 2am. Guarded on the credentials step, so a failure to authenticate
produces one clear error rather than two confusing ones.

**No `terraform plan` in CI.** A plan must read every resource in the account and
write a lock object to the state bucket, requiring a role far broader than the
deploy role and different in kind. Bolting those permissions on for a nicer PR
comment is a poor trade; the correct version is a separate read-only plan role,
which is a follow-up rather than something to fake.

**`terraform apply` stays manual.** Auto-apply on merge is defensible for a team
with real review discipline; for a single maintainer it means a typo reaches
production with nobody having read the diff.

**Failed rollouts roll back and fail the job.** `rollout status` with a timeout,
then `rollout undo` and a dump of recent events. A green tick over a broken
cluster is worse than a red one.

**Missing configuration fails fast and says what's missing.** `configure-aws-
credentials` treats an empty role as "look elsewhere", finds nothing, and retries
for two minutes before failing with no useful message.

---

## Testing

**Coverage omits the SDK client modules.** Unit-testing a thin wrapper means
asserting a mock was called with the arguments you just passed it. Their
correctness comes from running against real services. The gate is meaningful over
the code with decisions in it. Reasoning is in `pyproject.toml`, not folklore.

**Two lint rules suppressed, both with written reasons.** `B008` forbids function
calls in argument defaults, which is precisely how FastAPI declares dependencies —
the rule predates the framework. `S311` says `random` isn't cryptographically
secure, which is true and irrelevant to generating fixture data and picking a pod
to delete.

**A fake clock in the breaker tests; wide margins in the cache tests.** The
breaker has a state machine and gets injection; the cache has one time comparison
and gets a 6× margin. Effort follows risk, and the inconsistency is deliberate
rather than accidental.

**A test asserting a fresh cache hit does not call the upstream.** That test is
the Cost Explorer bill expressed as an assertion.
