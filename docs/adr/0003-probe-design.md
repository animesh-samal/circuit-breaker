# ADR-0003: Liveness checks nothing; readiness checks only non-degradable dependencies

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

This service depends on the Kubernetes API, CloudWatch, Cost Explorer, and DynamoDB. It is
designed to degrade rather than fail: when an upstream is unavailable, a circuit breaker
opens and cached data is served with the degraded state made visible in the UI.

Kubernetes acts differently on each probe. A failed liveness probe restarts the container.
A failed readiness probe removes the pod from the Service's endpoints while leaving the
container running. The two therefore cannot check the same things.

## Options considered

**Both probes verify all dependencies.** Superficially thorough. In practice an upstream
blip fails liveness on every replica simultaneously, so Kubernetes restarts the entire
deployment over a fault external to it — discarding warm caches and adding a reconnection
stampede to an already-degraded upstream. A transient dependency fault is converted into a
self-inflicted outage.

**Readiness verifies all dependencies, liveness verifies nothing.** Avoids the restart
storm. Still wrong for this service: if Cost Explorer is unreachable, every replica leaves
rotation even though each remains capable of serving the site, the deploy history, the
metrics, the live cluster view, and a cached cost figure. A cosmetic degradation becomes a
total outage.

**Liveness verifies nothing; readiness verifies only lifecycle and non-degradable
dependencies.** Chosen.

## Decision

`/api/health` performs no work and touches nothing external. Its diagnostic value lies in
whether the request completes at all: completion proves the process is running, the port is
bound, and the event loop is scheduling. A probe timeout indicates a wedged or dead process
— the only condition a restart actually repairs.

`/api/ready` reports lifecycle state (startup complete, not draining) and may in future
report dependencies that leave the service unable to do useful work. Degradable
dependencies are handled by circuit breakers and caches, never by readiness.

The governing question for readiness is "can this pod do useful work without it?", not
"is everything healthy?".

## Consequences

- Readiness is currently near-identical to liveness. This is the correct outcome for a
  service with no non-degradable dependencies, not an omission.
- Every future dependency requires an explicit ruling on degradability before it can be
  added to readiness.
- Readiness must return HTTP 503 on failure. Kubernetes acts on the status code and ignores
  the body; a 200 carrying `{"status": "not_ready"}` keeps the pod in rotation.
- `shutting_down` fails readiness during termination so the pod stops attracting new
  traffic before it exits. Correct draining additionally requires a `preStop` hook and a
  `terminationGracePeriodSeconds` longer than the readiness detection window — deferred to
  Phase 3.
- A startup probe will be added in Phase 3 so slow starts are not misread as liveness
  failures.

## Note

A minority position holds that liveness probes are net-harmful and frequently amplify
incidents rather than resolve them. One is included here because the failure it detects is
real and its presence is expected, but the argument is worth understanding rather than
dismissing.
