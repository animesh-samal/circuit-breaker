# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# Stage 1: build
# Node is needed to compile the app and is not needed to serve it. Keeping it in
# a separate stage means ~400 MB of toolchain never reaches production.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /build

# Manifests first, so `npm ci` is only re-run when dependencies actually change.
# Copying the whole source first would invalidate this layer on every edit.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY . .

# Build metadata reaches the bundle through Vite's import.meta.env, which only
# exposes variables prefixed VITE_.
ARG GIT_SHA=unknown
ARG GIT_TAG=unknown
ENV VITE_GIT_SHA=${GIT_SHA} \
    VITE_GIT_TAG=${GIT_TAG}

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: serve
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /build/dist /usr/share/nginx/html

# nginx's own unprivileged user. Port 8080 rather than 80 because a non-root
# process cannot bind below 1024.
RUN mkdir -p /tmp/client_temp && chown -R nginx:nginx /tmp /usr/share/nginx/html

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=3s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
