# AI service — design record

Python **FastAPI** microservice for Folio AI features.

- **Phase 1 (done):** health probes, config validation, provider registry (`noop` / `openai`), gRPC server on port **5246**, optional AraBERT classifier.
- **Phase 2 (largely done):** Nest BFF routes and frontend UI call ai-service over **gRPC** only (browser never talks to Python directly).

Informal stack context: [`docs/PROJECT-CONTEXT.md`](../PROJECT-CONTEXT.md). Runbook: [`services/ai-service/README.md`](../../services/ai-service/README.md).

## Why a separate service

1. **Python ecosystem** — LLM SDKs, embeddings, and ML tooling are strongest in Python; keeps the Nest API focused on peer-review domain logic.
2. **Secret isolation** — `OPENAI_API_KEY` and similar credentials live only in this service, not in the main API or browser.
3. **Independent scaling** — AI workloads can be scaled or throttled separately from the HTTP API.

## High-level architecture

```mermaid
flowchart LR
  UI["Next.js"] --> API["Nest backend"]
  API -->|"gRPC + optional x-folio-service-token"| AISvcGrpc["ai-service gRPC :5246"]
  Dev["Developer"] -->|"HTTP probes"| AISvcHttp["ai-service HTTP :5245"]
  subgraph grpc [gRPC services]
    Classifier["ClassifierService"]
    Keywords["KeywordService"]
    Plagiarism["PlagiarismService"]
    Similarity["SimilarityService"]
    Reviewer["ReviewerMatchingService"]
  end
  AISvcGrpc --> Classifier
  AISvcGrpc --> Keywords
  AISvcGrpc --> Plagiarism
  AISvcGrpc --> Similarity
  AISvcGrpc --> Reviewer
```

## Repository layout

| Path | Purpose |
|------|---------|
| [`proto/`](../../proto) | Buf module — all `folio.ai.v1` service contracts |
| [`services/ai-service/`](../../services/ai-service) | FastAPI app, gRPC server, providers, vector/ML modules, tests, Dockerfile |
| [`services/ai-service/app/config.py`](../../services/ai-service/app/config.py) | `pydantic-settings` + production validation |
| [`services/ai-service/app/providers/`](../../services/ai-service/app/providers) | `noop`, `openai` registry |
| [`services/ai-service/app/ml/vector/`](../../services/ai-service/app/ml/vector/) | Chroma-backed similarity, plagiarism, reviewer matching |
| [`docs/plans/ai-service.md`](./ai-service.md) | This design record |

No `packages/shared` mirror yet — event contracts are unnecessary until async jobs exist.

## Ports and probes

| Endpoint | Port | Role |
|----------|------|------|
| HTTP API | `5245` (`PORT`) | Uvicorn — health, readiness, `GET /v1/status` |
| gRPC | `5246` (`GRPC_PORT`) | Nest `AiClientService` — all product RPCs |
| `GET /health` | 5245 | Liveness |
| `GET /ready` | 5245 | Readiness (`checks.provider`) |

Aligns with the email-service health JSON shape (`status`, `checks`).

## gRPC services (proto)

| Proto | Service | Purpose |
|-------|---------|---------|
| `classifier.proto` | `ClassifierService` | AraBERT Arabic discipline classification |
| `keywords.proto` | `KeywordService` | LLM keyword suggestions (EN/AR) |
| `plagiarism.proto` | `PlagiarismService` | Corpus chunk similarity (editor/reviewer report) |
| `similarity.proto` | `SimilarityService` | Article index, related articles, catalog semantic search |
| `reviewer.proto` | `ReviewerMatchingService` | Editor suggested reviewers from profiles + history |

Regenerate stubs after editing `.proto`: `npm run proto:gen` from repo root. See [`proto/README.md`](../../proto/README.md).

## Configuration

See [`services/ai-service/.env.example`](../../services/ai-service/.env.example) and [`backend/.env.example`](../../backend/.env.example).

### ai-service

| Variable | Notes |
|----------|-------|
| `APP_ENV` | `development` \| `production`; also accepts legacy `NODE_ENV` when unset |
| `AI_PROVIDER` | `noop` (dev default) \| `openai` |
| `OPENAI_API_KEY` | Required for `openai` in production or `RUNTIME_CONFIG_STRICT=true` |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible gateway |
| `RUNTIME_CONFIG_STRICT` | Force production validation locally |
| `ARABERT_ENABLED` | `false` by default; enable gRPC `ClassifierService` locally |
| `ARABERT_MODEL_PATH` | Override weights directory |
| `SIMILARITY_ENABLED` | Chroma embeddings for related articles + catalog semantic search |
| `REVIEWER_MATCHING_ENABLED` | Requires `SIMILARITY_ENABLED` |
| `KEYWORDS_SUGGESTION_ENABLED` | Requires `AI_PROVIDER=openai` |
| `GRPC_PORT` | gRPC listen port (default `5246`) |
| `AI_SERVICE_TOKEN` | When set, required on gRPC metadata (`x-folio-service-token`) |

### Nest (BFF)

| Variable | ai-service prerequisite | Feature |
|----------|-------------------------|---------|
| `AI_SERVICE_ENABLED` | gRPC reachable | Base client; discipline on submit when classifier enabled |
| `AI_KEYWORDS_ENABLED` | `KEYWORDS_SUGGESTION_ENABLED` + `openai` | Author keyword suggestions |
| `AI_SIMILARITY_ENABLED` | `SIMILARITY_ENABLED` | Related articles, `searchMode=semantic`, corpus similarity |
| `AI_REVIEWER_MATCHING_ENABLED` | `REVIEWER_MATCHING_ENABLED` + `SIMILARITY_ENABLED` | `GET .../suggested-reviewers` |

Production rules (mirror email-service strictness):

- `AI_PROVIDER=noop` is rejected.
- `AI_PROVIDER=openai` requires a non-placeholder `OPENAI_API_KEY`.

### Optional Python extras

```bash
pip install -e ".[dev,ml]"         # AraBERT classifier
pip install -e ".[dev,similarity]" # Chroma + embeddings (similarity, plagiarism, reviewer matching)
```

## Arabic discipline classifier (AraBERT)

Fine-tuned `BertForSequenceClassification` over 10 Arabic discipline labels (see weights `config.json`).

| Item | Location |
|------|----------|
| Inference module | [`app/ml/arabic_classifier.py`](../../services/ai-service/app/ml/arabic_classifier.py) |
| Path resolution | [`app/ml/paths.py`](../../services/ai-service/app/ml/paths.py) |
| gRPC | `ClassifierService` when `ARABERT_ENABLED=true` |
| Notebook | [`classify.ipynb`](../../services/ai-service/archive/classify.ipynb) |
| ML extra | `pip install -e ".[ml]"` (torch, transformers, arabert) |

Weights stay on disk under the nested export folder or `ARABERT_MODEL_PATH`; they are gitignored. `/ready` checks `config.json` exists when enabled (no weight load). CI runs fast tests only; `RUN_ML_TESTS=1 pytest -m ml` for local integration.

## Provider layer

```text
AiProvider.ping() -> bool   # used by /ready
```

- **noop** — always ready; no outbound calls.
- **openai** — `AsyncOpenAI` client; `ping()` checks key presence only (no billed API call).

## Nest BFF integration (REST → gRPC)

All product AI traffic: **Nest → gRPC :5246**. The browser calls Nest only.

| Route | Who | gRPC | Purpose |
|-------|-----|------|---------|
| `POST /submissions/:slug/suggest-discipline` | Author (draft) | `ClassifierService` | Store `disciplineSuggested*` |
| `POST /submissions/:slug/suggest-keywords` | Author (draft) | `KeywordService.SuggestKeywords` | Return lists only (no persist) |
| `POST /submissions/suggest-keywords-preview` | Author (new wizard) | `KeywordService` | Same, title/abstract in body (no slug) |
| `PATCH /submissions/:slug/discipline` | Author | — | Confirm / override `discipline` |
| `GET /submissions/discipline-labels` | Author / editor | — | Label list + optional journal scope |
| `GET /submissions/:slug/corpus-similarity` | Editor / assigned reviewer | `PlagiarismService` | Overlap with indexed corpus (`AI_SIMILARITY_ENABLED`) |
| `GET /submissions/:slug/suggested-reviewers` | Editor | `ReviewerMatchingService` | Ranked reviewer candidates |
| `GET /public/submissions?searchMode=semantic` | Public | `SimilarityService` | Semantic publication catalog (`q` required) |
| On **submit** | Author | `ClassifierService` | Auto-classify when `AI_SERVICE_ENABLED` + classifier enabled |

Author keyword suggestions: partial results (1–2 terms) allowed; submit still requires 3–6 keywords per language.

When ai-service is down or flags are off, routes return structured errors (`AI_SERVICE_UNAVAILABLE`, etc.) or soft-empty payloads (e.g. corpus report `status: unavailable`).

## Phase 2 — remaining work

1. ~~Optional `X-Folio-Service-Token` validation on ai-service.~~ **Done** — gRPC interceptor when `AI_SERVICE_TOKEN` is set.
2. ~~Redact manuscript text in Nest logs (see email-service redactor patterns).~~ **Done** — `backend/src/common/ai-log-redaction.ts` used by `AiClientService.logGrpcFailure`.
3. Reviewer read-only discipline context in UI.
4. gRPC server streaming for LLM tokens (separate proto RPC).

**RabbitMQ** is optional later for jobs that exceed HTTP timeouts; not required for interactive UI features.

## Docker Compose (deferred)

[`docker-compose.dev.yml`](../../docker-compose.dev.yml) currently runs RabbitMQ only. The ai-service runs on the host in dev (same as email-service). A future compose service block:

```yaml
# ai-service:
#   build: ./services/ai-service
#   ports: ["5245:5245"]
#   env_file: ./services/ai-service/.env
```

## Security notes

- Do not expose this service directly to browsers.
- Do not log full prompts or manuscript bodies without redaction.
- Rate-limit at the Nest layer using existing throttler profiles on product routes.
- Do not publish gRPC port **5246** to the public internet; bind on internal network only.
- **Same-machine default:** `HTTP_BIND_HOST` and `GRPC_BIND_HOST` default to `127.0.0.1`. Nest uses `AI_SERVICE_GRPC_HOST=127.0.0.1`. Set a shared `AI_SERVICE_TOKEN` in both `backend/.env` and `services/ai-service/.env` when AI is enabled.
- Binding gRPC on `0.0.0.0` (or any non-loopback host) requires `AI_SERVICE_TOKEN`; use only when another container/host must connect.
