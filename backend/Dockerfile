# syntax=docker/dockerfile:1.7
# ------------------------------------------------------------------------------
# Folio API (NestJS) — production image.
#
# BUILD CONTEXT IS THE REPOSITORY ROOT, not backend/. The API depends on
# packages/shared and packages/nest-observability through npm `file:` links, so
# a backend-only context cannot resolve them.
#
#   docker build -f backend/Dockerfile -t folio-backend .
#
# Optional: bundle Chromium for the browser-based equation renderer
#   docker build -f backend/Dockerfile --build-arg WITH_CHROMIUM=true \
#     -t folio-backend:chromium .
#   ...then run with EQUATION_RENDER_MATHJAX_ONLY=0 to use it.
# ------------------------------------------------------------------------------

ARG NODE_IMAGE=node:22.20.0-bookworm-slim

# ---------- base ---------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /srv/folio

# ---------- workspace: build the two linked packages first ---------------------
# Each package owns a lockfile, so they install and compile independently and
# their layers stay cached until their own sources change.
FROM base AS workspace
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY packages/shared/package.json packages/shared/package-lock.json packages/shared/
RUN --mount=type=cache,target=/root/.npm \
    cd packages/shared && npm ci --ignore-scripts
COPY packages/shared/ packages/shared/
RUN cd packages/shared && npm run build

# nest-observability links @folio/shared, so it must come second.
COPY packages/nest-observability/package.json packages/nest-observability/package-lock.json packages/nest-observability/
RUN --mount=type=cache,target=/root/.npm \
    cd packages/nest-observability && npm ci --ignore-scripts
COPY packages/nest-observability/ packages/nest-observability/
RUN cd packages/nest-observability && npm run build

# ---------- build: compile the API ---------------------------------------------
FROM workspace AS build
COPY backend/package.json backend/package-lock.json backend/
RUN --mount=type=cache,target=/root/.npm \
    cd backend && npm ci
COPY backend/tsconfig.json backend/tsconfig.build.json backend/nest-cli.json backend/
COPY backend/src/ backend/src/
RUN cd backend && npm run build

# ---------- prod-deps: runtime dependency tree only ----------------------------
# Native modules (bcrypt, sharp) may compile here, so the toolchain is present in
# this stage and absent from the final image.
FROM base AS prod-deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=workspace /srv/folio/packages ./packages
COPY backend/package.json backend/package-lock.json backend/
RUN --mount=type=cache,target=/root/.npm \
    cd backend && npm ci --omit=dev
# Linked packages ship only their compiled dist at runtime; npm hoisted their
# runtime dependencies into backend/node_modules already.
RUN rm -rf packages/shared/node_modules packages/nest-observability/node_modules

# ---------- runtime ------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ARG WITH_CHROMIUM=false

ENV NODE_ENV=production \
    PORT=5243 \
    UPLOAD_DIR=/srv/folio/uploads \
    LOG_FORMAT=json \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# No browser in the default image, so equations render through MathJax only.
# Set this to 0 at runtime when the image was built with WITH_CHROMIUM=true.
ENV EQUATION_RENDER_MATHJAX_ONLY=1

# dumb-init reaps zombies and forwards SIGTERM so `docker stop` is a clean
# shutdown rather than a 10s kill; wget backs the healthcheck.
RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init wget ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 folio \
 && useradd --system --uid 1001 --gid folio --home /srv/folio folio

WORKDIR /srv/folio/backend

COPY --from=prod-deps --chown=folio:folio /srv/folio/packages /srv/folio/packages
COPY --from=prod-deps --chown=folio:folio /srv/folio/backend/node_modules ./node_modules
COPY --from=build     --chown=folio:folio /srv/folio/backend/dist ./dist
COPY --chown=folio:folio backend/package.json ./package.json

RUN if [ "$WITH_CHROMIUM" = "true" ]; then \
      npx --yes playwright install --with-deps chromium; \
    fi \
 && mkdir -p /srv/folio/uploads \
 && chown -R folio:folio /srv/folio/uploads

USER folio
EXPOSE 5243
VOLUME ["/srv/folio/uploads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider "http://127.0.0.1:${PORT}/api/v1/health" || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
