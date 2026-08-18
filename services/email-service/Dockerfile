# syntax=docker/dockerfile:1.7
# ------------------------------------------------------------------------------
# Folio email-service (NestJS worker) — production image.
#
# BUILD CONTEXT IS THE REPOSITORY ROOT. This service links @folio/shared and
# @folio/nest-observability with npm `file:` paths that resolve to packages/*,
# which sits outside services/email-service — a service-only context makes
# `npm ci` fail on those two dependencies.
#
#   docker build -f services/email-service/Dockerfile -t folio-email-service .
# ------------------------------------------------------------------------------

ARG NODE_IMAGE=node:22.20.0-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /srv/folio

# ---------- workspace ----------------------------------------------------------
FROM base AS workspace
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY packages/shared/package.json packages/shared/package-lock.json packages/shared/
RUN --mount=type=cache,target=/root/.npm \
    cd packages/shared && npm ci --ignore-scripts
COPY packages/shared/ packages/shared/
RUN cd packages/shared && npm run build

COPY packages/nest-observability/package.json packages/nest-observability/package-lock.json packages/nest-observability/
RUN --mount=type=cache,target=/root/.npm \
    cd packages/nest-observability && npm ci --ignore-scripts
COPY packages/nest-observability/ packages/nest-observability/
RUN cd packages/nest-observability && npm run build

# ---------- build ---------------------------------------------------------------
FROM workspace AS build
COPY services/email-service/package.json services/email-service/package-lock.json services/email-service/
RUN --mount=type=cache,target=/root/.npm \
    cd services/email-service && npm ci
COPY services/email-service/tsconfig.json services/email-service/
COPY services/email-service/src/ services/email-service/src/
RUN cd services/email-service && npm run build

# ---------- prod-deps -----------------------------------------------------------
FROM base AS prod-deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=workspace /srv/folio/packages ./packages
COPY services/email-service/package.json services/email-service/package-lock.json services/email-service/
RUN --mount=type=cache,target=/root/.npm \
    cd services/email-service && npm ci --omit=dev
RUN rm -rf packages/shared/node_modules packages/nest-observability/node_modules

# ---------- runtime -------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HTTP_PORT=5244 \
    HTTP_BIND_HOST=0.0.0.0 \
    LOG_FORMAT=json \
    NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init wget ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 folio \
 && useradd --system --uid 1001 --gid folio --home /srv/folio folio

WORKDIR /srv/folio/services/email-service

COPY --from=prod-deps --chown=folio:folio /srv/folio/packages /srv/folio/packages
COPY --from=prod-deps --chown=folio:folio /srv/folio/services/email-service/node_modules ./node_modules
COPY --from=build     --chown=folio:folio /srv/folio/services/email-service/dist ./dist
# Handlebars templates are read from disk at send time, not bundled.
COPY --chown=folio:folio services/email-service/templates ./templates
COPY --chown=folio:folio services/email-service/package.json ./package.json

USER folio
EXPOSE 5244

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider "http://127.0.0.1:${HTTP_PORT}/health" || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
