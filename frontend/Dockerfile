# syntax=docker/dockerfile:1.7
# ------------------------------------------------------------------------------
# Folio web app (Next.js) — production image.
#
# BUILD CONTEXT IS THE REPOSITORY ROOT: the app transpiles @folio/shared from
# packages/shared through an npm `file:` link, and next.config.ts sets
# outputFileTracingRoot to the monorepo root so the standalone bundle can trace
# those sources.
#
#   docker build -f frontend/Dockerfile -t folio-frontend .
#
# NEXT_PUBLIC_* values are inlined at build time, so they are build args here,
# not runtime env. Everything server-side (API_PROXY_TARGET, SENTRY_DSN) stays
# runtime env.
# ------------------------------------------------------------------------------

ARG NODE_IMAGE=node:22.20.0-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /srv/folio

# ---------- shared package ------------------------------------------------------
FROM base AS workspace
COPY packages/shared/package.json packages/shared/package-lock.json packages/shared/
RUN --mount=type=cache,target=/root/.npm \
    cd packages/shared && npm ci --ignore-scripts
COPY packages/shared/ packages/shared/
RUN cd packages/shared && npm run build

# ---------- build ---------------------------------------------------------------
FROM workspace AS build
COPY frontend/package.json frontend/package-lock.json frontend/
RUN --mount=type=cache,target=/root/.npm \
    cd frontend && npm ci

ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

COPY frontend/ frontend/
RUN cd frontend && npm run build

# ---------- runtime -------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=5240 \
    HOSTNAME=0.0.0.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init wget ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 folio \
 && useradd --system --uid 1001 --gid folio --home /srv/folio folio

WORKDIR /srv/folio

# `output: 'standalone'` emits a self-contained server plus only the traced
# node_modules — no npm install in this stage, no dev dependencies shipped.
COPY --from=build --chown=folio:folio /srv/folio/frontend/.next/standalone ./
COPY --from=build --chown=folio:folio /srv/folio/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=folio:folio /srv/folio/frontend/public ./frontend/public

USER folio
EXPOSE 5240

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider "http://127.0.0.1:${PORT}/en" || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "frontend/server.js"]
