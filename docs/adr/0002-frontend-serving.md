# ADR-0002: Serve the frontend from a separate nginx container

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

The React frontend compiles to static assets. Those assets have to be delivered to the
browser by some process, and API requests have to reach the Python service instead. Three
arrangements were available.

## Options considered

**A — nginx container alongside the API container.** Ingress routes `/api/*` to FastAPI and
all other paths to nginx. Two Deployments, two Services, path-based routing. Frontend and
backend release independently. Costs a second container's memory on a small node.

**B — FastAPI serves the static assets itself.** One container, one Deployment, no routing.
Lightest option. Couples frontend releases to backend releases: a stylesheet change
requires rebuilding and redeploying the API. Python is also markedly less efficient than
nginx at static delivery, though not at any traffic level this project will see.

**C — S3 with CloudFront.** Assets built in CI and synced to a bucket, served by the CDN;
the cluster runs only the API. This is the correct production answer — cheaper, faster
globally, and infinitely scalable. Introduces cross-origin requests and therefore CORS
configuration, plus cache invalidation on deploy.

## Decision

Option A.

Not because it is technically superior. For a personal site, C is the right production
architecture and B is the most proportionate engineering. A is chosen because Kubernetes
is the largest gap this project exists to close, and A is the only arrangement that
produces two workloads, path-based ingress routing, and independently scalable services —
the material that makes the cluster worth demonstrating.

## Consequences

- Two Deployments, two Services, and one Ingress with path-based rules.
- Roughly 20–30 MB additional memory on the node for nginx. Acceptable at 1 GB.
- Frontend and backend versions can drift; the version endpoint must report both.
- Migration to option C later is roughly an afternoon's work and remains open.
- The trade-off must be stated plainly rather than defended: in production the frontend
  belongs on a CDN, and it is in-cluster here for demonstrative reasons.
