# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# Stage 1: builder
#
# Compiles dependencies into a self-contained virtualenv. Nothing from this
# stage reaches the final image except /opt/venv -- no pip, no build tools, no
# source archives, no package cache.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Dependency metadata is copied before the source so that Docker can reuse the
# install layer when only application code changes.
#
# Trade-off, stated plainly: because dependencies are declared in pyproject.toml
# and setuptools needs the package present to build it, a source change still
# invalidates this layer. At this size that costs ~15s. The scalable fixes are a
# lockfile (uv, poetry export) or a generated requirements.txt -- both introduce
# a second source of truth, which is not worth it yet.
COPY pyproject.toml ./
COPY app ./app

RUN pip install --upgrade pip && pip install .

# ---------------------------------------------------------------------------
# Stage 2: runtime
#
# Starts from a clean base. Contains the interpreter, the virtualenv, and the
# application. Nothing else.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

# Build provenance, injected by CI. Baked in at build time rather than read from
# git at runtime: the image has no git binary and no .git directory, and an
# image should describe itself identically wherever it runs.
ARG GIT_SHA=unknown
ARG GIT_TAG=unknown
ARG BUILD_TIME=unknown

ENV GIT_SHA=${GIT_SHA} \
    GIT_TAG=${GIT_TAG} \
    BUILD_TIME=${BUILD_TIME} \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

# Fixed high UID. Root inside a container is root on the host if anything
# escapes; a numeric UID also lets Kubernetes assert runAsNonRoot without
# resolving a name.
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home app

COPY --from=builder /opt/venv /opt/venv

WORKDIR /srv
COPY --chown=app:app app ./app

USER 10001

EXPOSE 8000

# Used by docker compose and `docker ps`. Kubernetes ignores HEALTHCHECK
# entirely and uses the probes in the manifest instead -- this exists for local
# work only. Written with urllib because the slim image has no curl, and adding
# one for a health check is not worth the surface area.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2).status==200 else 1)"]

# Exec form, not shell form. Shell form wraps the process in /bin/sh, which does
# not forward SIGTERM -- the container would then be SIGKILLed after the grace
# period instead of shutting down cleanly, and in-flight requests would drop on
# every deploy.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
