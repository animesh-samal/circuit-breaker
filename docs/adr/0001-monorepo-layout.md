# ADR-0001: Single repository for application and infrastructure

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

Circuit Breaker consists of a Python API, a React frontend, Kubernetes manifests, and
Terraform infrastructure. These could live in one repository or several.

The project's purpose is to demonstrate that the application and the infrastructure that
runs it are one coherent system — a reviewer should be able to trace a request from the
ingress rule, through the Deployment, into the container, into the handler, in one place.

## Options considered

**Polyrepo** — separate repositories per component. Standard in larger organisations
because repository boundaries mirror team ownership and permit independent release
cycles and access control. Cost: a change spanning application and infrastructure becomes
multiple pull requests with ordering constraints, and version coherence has to be
maintained by something outside the repositories.

**Monorepo** — one repository containing all components. A single pull request can change
a handler, its Dockerfile, its manifest, and its Terraform atomically, and CI can verify
the combination. Cost: the pipeline must filter by changed path, or every commit rebuilds
every component.

## Decision

Monorepo.

The deciding factor is legibility rather than engineering merit. This repository is itself
a portfolio artifact; splitting it across three would conceal the relationship it exists to
demonstrate. Independent release cadence — polyrepo's main advantage — is worth nothing
with a single contributor.

## Consequences

- CI must implement path filtering so unrelated components are not rebuilt. This is
  additional work, but "how do you avoid rebuilding everything in a monorepo" is a
  question worth being able to answer.
- Repository-level access control cannot differentiate components. Irrelevant here.
- Terraform state remains separate from application versioning; the repository holds the
  configuration, not the state.
