# Configuration reference

Every environment variable Folio reads, per component, with defaults and the rules the code
actually enforces.

**Two configuration surfaces, one at a time:**

| Running | Configured by |
|---------|---------------|
| Natively (`npm run start:dev`, `uvicorn`) | `backend/.env`, `frontend/.env.local`, `services/*/.env` — one file per service |
| With `docker-compose.yml` | the repository-root `.env` alone (copied from `docker/.env.example`) |

The container stack deliberately ignores the per-service `.env` files: a deployed service must
be configured from its environment, not from a file baked next to the code.

Startup validation is real. The backend refuses to boot with example or weak secrets when the
environment looks deployed (HTTPS `APP_BASE_URL`, remote database, `AUTH_COOKIE_SECURE=true`),
even if `NODE_ENV` says otherwise. `RUNTIME_CONFIG_STRICT=true` forces those checks locally.

---

## 1. Secrets

| Variable | Used by | Must match |
|----------|---------|-----------|
| `JWT_SECRET` | backend | — (32+ random chars) |
| `EMAIL_SERVICE_TOKEN` | backend, email-service | each other |
| `AI_SERVICE_TOKEN` | backend, ai-service | each other |
| `DB_PASSWORD` | backend, postgres, ai-service (`VECTOR_DB_PASSWORD`) | the database |
| `EMAIL_DB_PASSWORD` | email-service, postgres-email | the database |
| `RABBITMQ_PASSWORD` | backend, email-service, rabbitmq | the broker |
| `OPENAI_API_KEY` | ai-service | the provider |
| `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_ID` | ai-service | the provider |
| `TYPESENSE_API_KEY` | backend, typesense | each other |

Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
or `python -c "import secrets; print(secrets.token_urlsafe(32))"`. One value per variable.

---

## 2. backend (NestJS API)

### Core

| Variable | Default | Notes |
|----------|---------|-------|
| `NODE_ENV` | `development` | `production` enables the strict config checks |
| `PORT` | `5243` | |
| `APP_BASE_URL` | `http://localhost:5240` | Public frontend URL used in outbound links. No trailing slash; HTTPS outside local |
| `FRONTEND_ORIGIN` | `http://localhost:5240,http://127.0.0.1:5240` | CORS allow-list, comma-separated |
| `SWAGGER_ENABLED` | on when `NODE_ENV != production` | Swagger UI at `/api-docs` |
| `RUNTIME_CONFIG_STRICT` | unset | `true` forces production-style validation |
| `UPLOAD_DIR` | `../uploads` | Manuscript storage; the only writable path |
| `DEFAULT_MANUSCRIPT_STYLE_ID` | `damascus-university-journal-v1` | Must exist in the style registry |

### Database

| Variable | Default | Notes |
|----------|---------|-------|
| `DB_TYPE` / `DB_HOST` / `DB_PORT` | `postgres` / `localhost` / `5434` | `5434` matches `docker-compose.dev.yml` |
| `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | `postgres` / — / `folio_review` | Needs the `pgvector` extension for AI features |
| `DB_MIGRATE_ON_START` | `true` | Set `false` when a release pipeline runs `npm run migrate:prod` |
| `DB_SYNCHRONIZE` | `false` | Never `true` outside throwaway databases |
| `DB_POOL_MAX` | `30` | |
| `DB_POOL_IDLE_TIMEOUT_MS`, `DB_POOL_CONNECTION_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS` | unset | Pool and query guardrails |
| `TYPEORM_MAX_QUERY_EXECUTION_TIME_MS` | unset | Slow-query logging threshold |

### Authentication

| Variable | Default | Notes |
|----------|---------|-------|
| `JWT_SECRET` | — | Required; 32+ random chars in any deployed environment |
| `JWT_EXPIRES_IN` / `REFRESH_EXPIRES_IN` | `15m` / `30d` | |
| `AUTH_COOKIE_SECURE` | `false` | `true` whenever served over HTTPS |
| `AUTH_RETURN_BEARER` | `false` | Returns the token in login JSON; bearer requests skip CSRF. Test harnesses only |
| `AUTH_OTP_TTL_MS` | `900000` | Email OTP lifetime |
| `AUTH_OTP_MAX_ATTEMPTS` / `AUTH_OTP_RESEND_COOLDOWN_MS` / `AUTH_OTP_MAX_SENDS_PER_HOUR` | `5` / `60000` / `5` | |
| `AUTH_RESET_TTL_MS` | `3600000` | Password-reset link lifetime |
| `ORCID_ENABLED` | `false` | ORCID sign-in and account linking |
| `ORCID_CLIENT_ID` / `ORCID_CLIENT_SECRET` | — | Required when enabled |
| `ORCID_API_BASE` / `ORCID_PUBLIC_API_BASE` | sandbox | Production: `https://orcid.org`, `https://pub.orcid.org` |
| `ORCID_REDIRECT_URI` | `${APP_BASE_URL}/api/v1/auth/orcid/callback` | |
| `ORCID_SCOPES` | `/authenticate /read-limited` | |

### Rate limiting

`THROTTLE_TTL_MS` (default `60000`) is the window for every profile. Per-handler limits:

| Variable | Default | Variable | Default |
|----------|---------|----------|---------|
| `THROTTLE_DEFAULT_LIMIT` | `120` | `THROTTLE_LOGIN_LIMIT` | `10` |
| `THROTTLE_PUBLIC_LIMIT` | `10000` | `THROTTLE_REGISTER_LIMIT` | `5` |
| `THROTTLE_UPLOAD_LIMIT` | `20` | `THROTTLE_REFRESH_LIMIT` | `30` |
| `THROTTLE_DOCX_LIMIT` | `10` | `THROTTLE_AUTH_OTP_LIMIT` | `10` |
| `THROTTLE_SSE_LIMIT` | `10` | `THROTTLE_AUTH_PASSWORD_RESET_LIMIT` | `5` |

The perf harness needs these raised to `10000` — see [`testing-performance.md`](./testing-performance.md).

### Messaging and email

| Variable | Default | Notes |
|----------|---------|-------|
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | |
| `RABBITMQ_EXCHANGE` | `folio.events` | Must match email-service |
| `EMAIL_SERVICE_URL` | `http://127.0.0.1:5244` | Internal admin API |
| `EMAIL_SERVICE_TOKEN` | — | Required for non-loopback binds |
| `EMAIL_QUEUE_METRICS_CACHE_MS` | `20000` | Queue-depth cache for pipeline status |
| `DEFAULT_EMAIL_LOCALE` | `en` | Fallback when the recipient has no preference |

**`EMAIL_PROVIDER` and `SMTP_*` must never appear in `backend/.env` — the API refuses to start
if they do.** Outbound mail belongs to email-service alone.

### AI integration

| Variable | Default | Notes |
|----------|---------|-------|
| `AI_SERVICE_ENABLED` | `false` | Master switch |
| `AI_SERVICE_GRPC_HOST` / `AI_SERVICE_GRPC_PORT` | `127.0.0.1` / `5246` | |
| `AI_SERVICE_TOKEN` | — | Must match ai-service |
| `AI_SERVICE_TIMEOUT_MS` | `120000` | Synchronous RPC deadline |
| `AI_CORPUS_SIMILARITY_TIMEOUT_MS` | `300000` | Plagiarism job deadline |
| `AI_JOBS_CONSUMER_ENABLED` | `true` | In-process worker for async AI jobs |
| `AI_SIMILARITY_ENABLED` | `false` | Pairs with `SIMILARITY_ENABLED` |
| `AI_KEYWORDS_ENABLED` | `false` | Pairs with `KEYWORDS_SUGGESTION_ENABLED` |
| `AI_REVIEWER_MATCHING_ENABLED` | `false` | Pairs with `REVIEWER_MATCHING_ENABLED` |
| `AI_COPYEDIT_ENABLED` | `false` | Pairs with `COPYEDIT_ANALYSIS_ENABLED` |
| `AI_WEB_SIMILARITY_ENABLED` | `false` | Pairs with `WEB_SIMILARITY_ENABLED` |
| `JOURNAL_ALLOWED_DISCIPLINES` | unset | Pipe-separated Arabic labels; empty allows all model labels |

### Search, grammar, rendering, auditing

| Variable | Default | Notes |
|----------|---------|-------|
| `TYPESENSE_ENABLED` | `false` | Public catalogue search |
| `TYPESENSE_HOST` / `TYPESENSE_PORT` / `TYPESENSE_API_KEY` / `TYPESENSE_COLLECTION` | `localhost` / `8108` / `xyz` / `publications` | |
| `LANGUAGE_TOOL_ENABLED` | `false` | Copyedit grammar checks |
| `LANGUAGE_TOOL_URL` | `http://localhost:8010` | |
| `EQUATION_RENDER_MATHJAX_ONLY` | `0` natively, `1` in the image | `1` skips the Chromium renderer |
| `AUDIT_SAMPLE_RATE` | `1.0` | `0.0`–`1.0` |
| `AUDIT_RETENTION_DAYS` | `90` | `0` disables the nightly purge |

---

## 3. frontend (Next.js)

| Variable | Default | Scope | Notes |
|----------|---------|-------|-------|
| `PORT` | `5240` | runtime | |
| `HOSTNAME` | `0.0.0.0` (image) | runtime | Standalone server bind address |
| `API_PROXY_TARGET` | `http://127.0.0.1:5243` | runtime | Server-side rewrite target for `/api/v1/*` |
| `NEXT_PUBLIC_API_URL` | empty | **build** | Empty = same-origin through the rewrite (recommended, keeps cookie auth) |
| `NEXT_PUBLIC_SENTRY_DSN` | empty | **build** | |
| `SENTRY_DSN` | empty | runtime | Server-side error reporting |
| `ANALYZE` | unset | build | `true` runs the bundle analyzer |

`NEXT_PUBLIC_*` is inlined into the client bundle at build time — changing it needs a rebuild.
E2E-only variables (`E2E_*`, `REUSE_DEV_SERVER`) are documented in `frontend/.env.local.example`.

---

## 4. email-service

| Variable | Default | Notes |
|----------|---------|-------|
| `NODE_ENV` | `development` | |
| `DB_HOST` / `DB_PORT` | `localhost` / `5433` | Dedicated instance, separate from the API database |
| `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | `postgres` / — / `folio_email` | |
| `DB_SCHEMA` | `email` | Never collides with the API's `public` schema |
| `DB_POOL_*`, `TYPEORM_MAX_QUERY_EXECUTION_TIME_MS` | as backend | |
| `HTTP_PORT` / `HTTP_BIND_HOST` | `5244` / `127.0.0.1` | `0.0.0.0` in containers. Legacy aliases: `HEALTH_PORT`, `HEALTH_BIND_HOST` |
| `EMAIL_SERVICE_TOKEN` | `dev-email-internal-token` | Required in every environment; must match the backend |
| `RABBITMQ_URL` / `RABBITMQ_EXCHANGE` | `amqp://guest:guest@localhost:5672` / `folio.events` | Must match the backend |
| `EMAIL_PROVIDER` | `noop` | `noop` logs would-be sends; `smtp` sends |
| `EMAIL_FROM` | `no-reply@folio.local` | |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | — | Required when `EMAIL_PROVIDER=smtp` |
| `REVIEW_DUE_IN_DAYS` | `21` | Due-soon fires at `-3` days, overdue at `+1` |
| `APP_BASE_URL` | `http://localhost:5240` | Link base inside emails |

---

## 5. ai-service

### Runtime

| Variable | Default | Notes |
|----------|---------|-------|
| `APP_ENV` | `development` | |
| `PORT` / `HTTP_BIND_HOST` | `5245` / `127.0.0.1` | HTTP is probes and status only |
| `GRPC_PORT` / `GRPC_BIND_HOST` | `5246` / `127.0.0.1` | All product RPCs |
| `AI_SERVICE_TOKEN` | — | **Required when `GRPC_BIND_HOST` is not loopback — the service refuses to start otherwise** |
| `RUNTIME_CONFIG_STRICT` | `false` | Forces production-style validation locally |

### Provider

| Variable | Default | Notes |
|----------|---------|-------|
| `AI_PROVIDER` | `noop` | `noop` makes no external calls |
| `OPENAI_API_KEY` | — | Required when `AI_PROVIDER=openai` |
| `OPENAI_BASE_URL` | OpenAI | Azure, Ollama, LM Studio, LiteLLM all work here |
| `OPENAI_MODEL` | `gpt-4o-mini` | |

### Feature flags (each also needs its Python extra installed)

| Variable | Default | Extra | Pairs with |
|----------|---------|-------|-----------|
| `SIMILARITY_ENABLED` | `false` | `similarity` | `AI_SIMILARITY_ENABLED` |
| `REVIEWER_MATCHING_ENABLED` | `false` | `similarity` | `AI_REVIEWER_MATCHING_ENABLED` |
| `KEYWORDS_SUGGESTION_ENABLED` | `false` | core | `AI_KEYWORDS_ENABLED` |
| `COPYEDIT_ANALYSIS_ENABLED` | `false` | core | `AI_COPYEDIT_ENABLED` |
| `EXACT_MATCH_ENABLED` | `false` | `corpus` | plagiarism jobs |
| `WEB_SIMILARITY_ENABLED` | `false` | `ml,web_similarity` | `AI_WEB_SIMILARITY_ENABLED` |
| `ARABERT_ENABLED` | `false` | `ml` + weights on disk | discipline classification |

### Vector database and models

| Variable | Default | Notes |
|----------|---------|-------|
| `VECTOR_DB_HOST` / `VECTOR_DB_PORT` | `localhost` / `5432` | The same `folio_review` database, pgvector tables |
| `VECTOR_DB_USER` / `VECTOR_DB_PASSWORD` / `VECTOR_DB_DATABASE` | `postgres` / — / `folio_review` | |
| `VECTOR_DB_SSL` / `VECTOR_DB_HNSW_EF_SEARCH` | `false` / `64` | |
| `SIMILARITY_MODEL_NAME` | `paraphrase-multilingual-mpnet-base-v2` | |
| `SIMILARITY_BATCH_SIZE` / `SIMILARITY_DEVICE` | `32` / `cpu` | |
| `SIMILARITY_DEFAULT_LIMIT` / `SIMILARITY_SEARCH_DEFAULT_LIMIT` | `5` / `20` | |
| `SIMILARITY_DEFAULT_THRESHOLD` / `SIMILARITY_SAME_CATEGORY_ONLY` | `0.35` / `true` | |
| `ARABERT_MODEL_PATH` | repo-local path | Weights are not committed |
| `ARABERT_WARMUP_ON_STARTUP` | `true` | Preloads weights; adds ~1 min startup on CPU |
| `ARABERT_PREPROCESSOR_MODEL` / `ARABERT_DEFAULT_THRESHOLD` / `ARABERT_IDLE_TIMEOUT_SECONDS` | `aubmindlab/bert-base-arabertv02` / `0.0` / `300` | |
| `HF_HOME` | `/srv/folio/cache/huggingface` (image) | Mounted volume so weights survive container replacement |

### Web plagiarism and OCR

| Variable | Default | Notes |
|----------|---------|-------|
| `GOOGLE_CSE_API_KEY` / `GOOGLE_CSE_ID` | — | Required when `WEB_SIMILARITY_ENABLED=true` |
| `FARASA_API_KEY` | — | Arabic segmentation |
| `WEB_SIMILARITY_MAX_QUERIES` / `WEB_SIMILARITY_RESULTS_PER_QUERY` | `5` / `10` | |
| `WEB_SIMILARITY_THRESHOLD` / `WEB_SIMILARITY_SEARCH_LANG` / `WEB_SIMILARITY_FETCH_WORKERS` | `70` / `ar` / `5` | |
| `MISTRAL_API_KEY` | — | Hosted OCR for PDFs with broken text layers. **Offline ingest only — never on the submission path**; billed per page |

---

## 6. Observability (all services)

| Variable | Default | Notes |
|----------|---------|-------|
| `LOG_LEVEL` | `info` | |
| `LOG_FORMAT` | `pretty` locally, `json` in images | |
| `OTEL_SERVICE_NAME` | per service | `folio-backend`, `folio-email-service`, `folio-ai-service` |
| `OTEL_TRACES_EXPORTER` | `none` | `otlp` to export |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | Required when exporting, e.g. `http://collector:4318/v1/traces` |
| `OTEL_TRACES_SAMPLER` / `OTEL_TRACES_SAMPLER_ARG` | unset | e.g. `parentbased_traceidratio` + `0.1` |

Details: [`OBSERVABILITY.md`](./OBSERVABILITY.md).

---

## 7. Compose-only variables

Read by `docker-compose.yml` itself, not by any service:

| Variable | Default | Purpose |
|----------|---------|---------|
| `IMAGE_PREFIX` / `IMAGE_TAG` | `folio` / `local` | Built image names |
| `FRONTEND_HTTP_PORT` / `BACKEND_HTTP_PORT` / `RABBITMQ_MANAGEMENT_PORT` | `5240` / `5243` / `15672` | Host port mappings |
| `AI_PIP_EXTRAS` | `corpus` | Python extras baked into the ai-service image |
| `BACKEND_WITH_CHROMIUM` | `false` | Bundle Chromium for the equation renderer |
| `POSTGRES_IMAGE_TAG` / `POSTGRES_EMAIL_IMAGE_TAG` / `RABBITMQ_IMAGE_TAG` / `TYPESENSE_IMAGE_TAG` / `LANGUAGETOOL_IMAGE_TAG` | `pg17` / `17-alpine` / `3-management` / `26.0` / `latest` | Pin these for reproducible deploys |
| `LANGUAGETOOL_HEAP` | `512m` | JVM max heap |
