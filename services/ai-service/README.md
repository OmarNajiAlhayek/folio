# Folio AI service

Python **FastAPI** microservice for Folio AI features: health probes, environment validation, a pluggable LLM provider layer (`noop` by default), optional **AraBERT Arabic discipline classifier**, **keyword suggestions**, **article similarity**, **corpus plagiarism detection**, and **reviewer matching** — all product traffic over **gRPC** (Nest BFF only).

Design record: [`docs/plans/ai-service.md`](../../docs/plans/ai-service.md).

## Prerequisites

- Python 3.12+

## Setup

```bash
cd services/ai-service
cp .env.example .env
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
```

For the Arabic discipline classifier (local only):

```bash
pip install -e ".[dev,ml]"
```

Place fine-tuned weights under `arabert_clean_model_FINAL-20260525T161953Z-3-001/arabert_clean_model_FINAL/` (or set `ARABERT_MODEL_PATH`). Weights are not committed to git.

## Run locally

```bash
uvicorn app.main:app --reload --port 5245
```

- **HTTP (5245):** liveness, readiness, aggregated `GET /v1/status` only.
- **gRPC (5246, `GRPC_PORT`):** all product RPCs for Nest (`ClassifierService`, `KeywordService`, `PlagiarismService`, `SimilarityService`, `ReviewerMatchingService`). See [`proto/README.md`](../../proto/README.md).

When `ARABERT_ENABLED=true`, startup **preloads tokenizer + weights** by default (`ARABERT_WARMUP_ON_STARTUP=true`) so the first UI classify is fast. Expect ~1 minute extra startup time on CPU; set `ARABERT_WARMUP_ON_STARTUP=false` to skip.

- Liveness: `http://localhost:5245/health`
- Readiness: `http://localhost:5245/ready`
- API status: `http://localhost:5245/v1/status`

With `AI_PROVIDER=noop` (default), no API keys are required.

### gRPC smoke (grpcurl)

With reflection enabled in development:

```bash
grpcurl -plaintext localhost:5246 list
grpcurl -plaintext localhost:5246 folio.ai.v1.ClassifierService/GetClassifierStatus
grpcurl -plaintext localhost:5246 folio.ai.v1.SimilarityService/GetSimilarityStatus
```

With a service token configured:

```bash
grpcurl -plaintext -H "x-folio-service-token: YOUR_TOKEN" localhost:5246 folio.ai.v1.ClassifierService/GetClassifierStatus
```

Without reflection, pass `-import-path proto -proto folio/ai/v1/<service>.proto` from the repo root.

Regenerate stubs after editing `.proto`: `npm run proto:gen` (requires [Buf CLI](https://buf.build/docs/installation) or `npx buf` from repo root).

### AraBERT classifier (dev)

Set `ARABERT_ENABLED=true` in `.env`, then:

```bash
python scripts/verify_classifier.py
grpcurl -plaintext -d '{"abstract":"تهدف هذه الدراسة إلى تحليل الأثر الاقتصادي."}' \
  localhost:5246 folio.ai.v1.ClassifierService/ClassifyAbstract
```

Jupyter: open `archive/classify.ipynb` (imports `AdvancedArabicClassifier` from `app.ml`).

### Author keyword suggestions (dev)

Requires OpenAI (or compatible gateway):

```bash
# services/ai-service/.env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
KEYWORDS_SUGGESTION_ENABLED=true
AI_SERVICE_TOKEN=your-shared-secret
```

```bash
# backend/.env
AI_SERVICE_ENABLED=true
AI_KEYWORDS_ENABLED=true
AI_SERVICE_GRPC_HOST=127.0.0.1
AI_SERVICE_TOKEN=your-shared-secret
```

Nest route: `POST /submissions/:slug/suggest-keywords` (author draft only) → gRPC `KeywordService.SuggestKeywords` on port **5246**.

### Similarity and reviewer matching (dev)

```bash
# services/ai-service/.env
pip install -e ".[dev,similarity]"
SIMILARITY_ENABLED=true
REVIEWER_MATCHING_ENABLED=true

# backend/.env
AI_SERVICE_ENABLED=true
AI_SIMILARITY_ENABLED=true
AI_REVIEWER_MATCHING_ENABLED=true
AI_SERVICE_GRPC_HOST=127.0.0.1
```

Nest routes: `GET /submissions/:slug/corpus-similarity` (gRPC `PlagiarismService`), `GET /submissions/:slug/suggested-reviewers` (`ReviewerMatchingService`), public catalog `searchMode=semantic` (`SimilarityService`).

```bash
grpcurl -plaintext localhost:5246 folio.ai.v1.PlagiarismService/GetPlagiarismStatus
grpcurl -plaintext localhost:5246 folio.ai.v1.ReviewerMatchingService/GetReviewerMatchingStatus
```

## Tests

```bash
pytest
ruff check app tests
```

Full model inference (slow, needs weights):

```bash
RUN_ML_TESTS=1 pytest -m ml
```

## Docker

```bash
docker build -t folio-ai-service .
docker run --rm -p 5245:5245 -e AI_PROVIDER=noop folio-ai-service
```

Do **not** publish port **5246** to the public internet; bind gRPC on the internal Docker/K8s network only (`AI_SERVICE_GRPC_HOST=ai-service` from Nest).

Production images should set `APP_ENV=production`, `AI_PROVIDER=openai`, and a real `OPENAI_API_KEY`.
