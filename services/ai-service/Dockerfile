# syntax=docker/dockerfile:1.7
# ------------------------------------------------------------------------------
# Folio ai-service (FastAPI + gRPC) — production image.
#
# Build context: services/ai-service (this service has no monorepo links; the
# generated protobuf stubs are committed under app/grpc/gen).
#
#   docker build -t folio-ai-service services/ai-service
#
# Extras are opt-in because they differ by orders of magnitude in size:
#   corpus      (default)  psycopg + PDF readers  → exact-overlap plagiarism  ~250 MB
#   similarity            + sentence-transformers/torch → embeddings, reviewer
#                          matching, related articles                 ~3 GB
#   ml                    + AraBERT discipline classifier             ~3 GB
#   web_similarity        + Google CSE web plagiarism stage
#
#   docker build --build-arg PIP_EXTRAS=corpus,similarity -t folio-ai-service services/ai-service
#
# Every feature is also gated by an env flag (SIMILARITY_ENABLED, ARABERT_ENABLED,
# EXACT_MATCH_ENABLED, ...): the extra installs the code, the flag turns it on.
# ------------------------------------------------------------------------------

ARG PYTHON_IMAGE=python:3.12-slim-bookworm

# ---------- build ---------------------------------------------------------------
FROM ${PYTHON_IMAGE} AS build
ARG PIP_EXTRAS=corpus

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH

# build-essential is needed by source-only wheels; it stays out of the runtime image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

RUN python -m venv "$VIRTUAL_ENV"

WORKDIR /srv/folio/ai-service
COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install --no-cache-dir ".[${PIP_EXTRAS}]"

# ---------- runtime -------------------------------------------------------------
FROM ${PYTHON_IMAGE} AS runtime

ENV VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_ENV=production \
    LOG_FORMAT=json \
    PORT=5245 \
    GRPC_PORT=5246

# Containers have no useful loopback for siblings, so both listeners bind to all
# interfaces. The service then REQUIRES AI_SERVICE_TOKEN at startup — a non-loopback
# gRPC bind without a shared secret is refused rather than silently exposed.
ENV HTTP_BIND_HOST=0.0.0.0 \
    GRPC_BIND_HOST=0.0.0.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 folio \
 && useradd --system --uid 1001 --gid folio --home /srv/folio folio

WORKDIR /srv/folio/ai-service

COPY --from=build --chown=folio:folio /opt/venv /opt/venv
COPY --chown=folio:folio pyproject.toml README.md ./
COPY --chown=folio:folio app ./app
# Corpus importers / OCR reindex tools, run as one-off jobs:
#   docker compose run --rm ai-service python scripts/import_oai_pmh.py --help
COPY --chown=folio:folio scripts ./scripts

# Hugging Face / sentence-transformers cache: a writable path owned by the app
# user, mountable as a volume so model downloads survive a container replace.
ENV HF_HOME=/srv/folio/cache/huggingface
RUN mkdir -p "$HF_HOME" && chown -R folio:folio /srv/folio/cache

USER folio
EXPOSE 5245 5246
VOLUME ["/srv/folio/cache"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','5245')+'/health')" || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["python", "-m", "app.main"]
