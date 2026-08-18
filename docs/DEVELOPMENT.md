# Development

Getting Folio running on a workstation, and the day-to-day commands.

Prerequisites: **Node.js LTS**, **PostgreSQL 17** (native or containerised), **Python 3.12+**
(only for ai-service), **Docker** (optional but recommended for RabbitMQ). Every environment
variable is documented in [`CONFIGURATION.md`](./CONFIGURATION.md).

---

## 1. Pick a setup

| Setup | Postgres | RabbitMQ + optional infra | App services | Best for |
|-------|----------|---------------------------|--------------|----------|
| **A — Light Docker** (recommended on Windows) | native, port 5432 | `docker-compose.infra.yml` | native, hot reload | Daily development; lowest RAM |
| **B — Containerised Postgres** | `docker-compose.dev.yml`, ports 5434 / 5433 | same file | native, hot reload | No native Postgres install |
| **C — Everything in Docker** | container | container | containers with bind mounts | One-command stack; heavy on Windows |
| **D — Production stack** | container | container | built images, no mounts | Verifying a release — see [`DEPLOYMENT.md`](./DEPLOYMENT.md) |

**Run one at a time.** These files share ports 5432/5434, 5672 and 15672; two at once fail with
"port is already allocated".

---

## 2. Setup A — light Docker + native Postgres

**1. Databases.** Create `folio_review` and `folio_email` on the local instance, enable
pgvector, and create the `email` schema. [`scripts/setup-native-postgres.sql`](../scripts/setup-native-postgres.sql)
does all of it:

```sql
CREATE DATABASE folio_review;
CREATE DATABASE folio_email;
\c folio_review
CREATE EXTENSION IF NOT EXISTS vector;   -- required by backend migrations
\c folio_email
CREATE SCHEMA IF NOT EXISTS email;
```

On Windows without pgvector, run [`scripts/install-pgvector-windows.ps1`](../scripts/install-pgvector-windows.ps1)
as Administrator, restart PostgreSQL, then create the extension.

**2. Infrastructure.**

```bash
docker compose -f docker-compose.infra.yml up -d     # RabbitMQ, LanguageTool, Typesense
```

**3. Configuration.** Copy each example and set `DB_PORT=5432` for a native install:

| Copy | To |
|------|----|
| `backend/.env.example` | `backend/.env` |
| `frontend/.env.local.example` | `frontend/.env.local` |
| `services/email-service/.env.example` | `services/email-service/.env` |
| `services/ai-service/.env.example` | `services/ai-service/.env` |

Two rules the code enforces: **`SMTP_*` and `EMAIL_PROVIDER` belong only in
`services/email-service/.env`** — the API refuses to start if they appear in `backend/.env`; and
**leave `NEXT_PUBLIC_API_URL` empty** so the browser calls same-origin `/api/v1` (a direct URL
breaks httpOnly cookie auth and is blocked by CSP `connect-src 'self'`).

**4. Repo root once** — enables the Husky pre-commit hook:

```bash
npm install
```

**5. Services**, one terminal each:

```bash
cd backend               && npm install && npm run migrate && npm run seed && npm run start:dev
cd frontend              && npm install && npm run dev
cd services/email-service && npm install && npm run start:dev      # optional in dev
cd services/ai-service   && python -m venv .venv && pip install -e ".[dev]" \
                         && uvicorn app.main:app --reload --port 5245   # optional
```

**Windows shortcut:** [`run-dev.bat`](../run-dev.bat) starts the infra compose file, waits for
RabbitMQ, then opens a terminal per service. [`dev-lmstudio.bat`](../dev-lmstudio.bat) does the
same with a local LM Studio model behind `AI_PROVIDER=openai`.

### Setups B and C

```bash
docker compose -f docker-compose.dev.yml up -d      # B: adds postgres (5434) + postgres-email (5433)
docker compose -f docker-compose.local.yml up       # C: infra + all app services, hot reload
```

Setup B needs `DB_PORT=5434` in `backend/.env` and `5433` in `services/email-service/.env` —
which is what the `.env.example` files already ship.

---

## 3. Endpoints

| URL | What |
|-----|------|
| `http://localhost:5240` | Web app |
| `http://localhost:5243/api/v1` | API |
| `http://localhost:5243/api-docs` | Swagger UI (`/api-docs-json` for codegen) |
| `http://localhost:5243/api/v1/health` | API health — `/health/outbox` for outbox stats |
| `http://localhost:5244/health` | email-service (internal) |
| `http://localhost:5245/health`, `/ready`, `/v1/status` | ai-service HTTP |
| `localhost:5246` | ai-service gRPC |
| `http://localhost:15672` | RabbitMQ management (guest/guest in dev) |

---

## 4. Sample accounts

After `npm run seed` in `backend/`:

| Email | Password | Roles |
|-------|----------|-------|
| `author@folio.local` | `Author123!` | Author |
| `manager@folio.local` | `Manager123!` | Journal manager |
| `editor@folio.local` | `Editor123!` | Editor + reviewer |
| `reviewer@folio.local` | `Reviewer123!` | Reviewer |
| `copyeditor@folio.local` | `Copyeditor123!` | Copyeditor |

Seed variants:

| Command | Effect |
|---------|--------|
| `npm run seed` | Sample data + publication-catalogue search schema (FTS + `pg_trgm`) |
| `npm run seed:reset` | Reset only `[SAMPLE]` / legacy `[DEMO]` submissions |
| `npm run seed:fresh` | Wipe the app database and uploads, then re-seed |
| `npm run seed:perf` | Perf fixtures only (no `[Demo]` titles) |
| `npm run seed:all` *(repo root)* | `seed` + `seed:perf` |

Seeded accounts get roles directly. In the product, `editor` and `journal_manager` require an
in-app invitation — see [`PRODUCT-SPECIFICATION.md`](./PRODUCT-SPECIFICATION.md).

---

## 5. Enabling optional features

Every optional capability is off by default and needs **both** sides switched on:

| Feature | `backend/.env` | Other side |
|---------|----------------|-----------|
| Discipline classification | `AI_SERVICE_ENABLED=true` | `ARABERT_ENABLED=true` + `.[ml]` + weights on disk |
| Keyword suggestions | `AI_KEYWORDS_ENABLED=true` | `KEYWORDS_SUGGESTION_ENABLED=true`, `AI_PROVIDER=openai` |
| Related articles, semantic search | `AI_SIMILARITY_ENABLED=true` | `SIMILARITY_ENABLED=true` + `.[similarity]` |
| Reviewer matching | `AI_REVIEWER_MATCHING_ENABLED=true` | `REVIEWER_MATCHING_ENABLED=true` + `SIMILARITY_ENABLED=true` |
| Copyedit reference check | `AI_COPYEDIT_ENABLED=true` | `COPYEDIT_ANALYSIS_ENABLED=true`, `AI_PROVIDER=openai` |
| Exact-overlap plagiarism | plagiarism job flags | `EXACT_MATCH_ENABLED=true` + `.[corpus]` + a populated corpus |
| Grammar / spelling | `LANGUAGE_TOOL_ENABLED=true` | LanguageTool container on 8010 |
| Publication search | `TYPESENSE_ENABLED=true` | Typesense container on 8108 (collection syncs automatically) |

`AI_SERVICE_TOKEN` must be identical in `backend/.env` and `services/ai-service/.env`; likewise
`EMAIL_SERVICE_TOKEN` for the API and email-service. Feature detail:
[`AI-FEATURES.md`](./AI-FEATURES.md).

---

## 6. Tests

| Scope | Command | Notes |
|-------|---------|-------|
| Backend unit | `cd backend && npm test` | |
| Backend e2e | `cd backend && npm run test:e2e` | |
| Backend query plans | `cd backend && npm run test:query-plans` | Opt-in; needs Postgres |
| Email pipeline | `npm run test:pipeline` *(root)* | Opt-in: assign → outbox → RabbitMQ. [`testing-email-pipeline.md`](./testing-email-pipeline.md) |
| AI jobs pipeline | `cd backend && npm run test:ai-jobs` | Opt-in; needs Postgres + RabbitMQ + ai-service |
| Frontend unit | `cd frontend && npm run test:unit` | Vitest |
| Frontend E2E | `cd frontend && npm run e2e:install && npm run test:e2e` | Playwright starts both servers itself |
| ai-service | `cd services/ai-service && pytest` | Plus `ruff check app tests` |
| Performance | `npm run test:perf` *(root)* | k6 + gRPC. [`testing-performance.md`](./testing-performance.md) |

Integration suites are opt-in by environment flag on purpose: a plain `npm test` must not
require a database, a broker or a Python service.

---

## 7. Cross-cutting workflows

**Shared package.** After editing `packages/shared/`, rebuild before running or testing the
Nest apps — they consume the compiled `dist`:

```bash
npm run build:shared      # from the repository root
```

**Protobuf.** Only contributors changing `.proto` need the Buf toolchain; everyone else uses the
committed stubs.

```bash
npm run proto:lint
npm run proto:gen         # regenerates Python + TypeScript stubs — commit the result
```

CI fails if generated stubs are stale.

**Migrations.** Schema changes are TypeORM migrations, never `synchronize`:

```bash
cd backend && npm run migrate:generate     # writes src/db/migrations/Migration<ts>.ts
cd backend && npm run migrate              # apply
cd backend && npm run migrate:revert       # roll back one
```

The API also applies pending migrations at startup unless `DB_MIGRATE_ON_START=false`.

**Formatting and linting** run automatically on staged files through Husky + lint-staged
(Prettier, then ESLint). Run them directly with `npm run lint` in `backend/` or `frontend/`.

---

## 8. Repository layout

```
backend/                  NestJS API (/api/v1)
frontend/                 Next.js app (App Router, en/ar, RTL)
services/email-service/   NestJS worker — RabbitMQ consumer, reminders, templates
services/ai-service/      Python FastAPI + gRPC — classification, similarity, plagiarism
packages/shared/          @folio/shared — event contracts, topology, idempotency, IDs
packages/nest-observability/  logging, request/trace correlation, OTLP wiring
proto/                    Protobuf contracts (Buf); generated stubs are committed
docs/                     Specifications, runbooks, design records, diagrams
perf/                     k6 + gRPC performance harness
scripts/                  Native Postgres and pgvector bootstrap (Windows-oriented)
docker/                   Container assets: Postgres init SQL, stack .env template
uploads/                  Manuscript storage created at runtime (gitignored)
```

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Backend migration fails on `vector` | pgvector missing on `folio_review` | `CREATE EXTENSION vector` (Windows: `scripts/install-pgvector-windows.ps1`) |
| email-service migration fails | `email` schema missing in `folio_email` | `CREATE SCHEMA IF NOT EXISTS email;` |
| Login works, then every call is 401 | `NEXT_PUBLIC_API_URL` points directly at the API | Leave it empty; use the same-origin rewrite |
| API exits at startup complaining about mail | `SMTP_*` / `EMAIL_PROVIDER` in `backend/.env` | Move them to `services/email-service/.env` |
| Type errors on `@folio/shared` after an edit | Stale compiled output | `npm run build:shared` |
| "port is already allocated" | Two compose files running | `docker compose -f <other> down` |
| Old database, migrations refuse to apply | Schema predates migration tracking | `npm run seed:fresh`, or baseline: `INSERT INTO migrations (timestamp, name) VALUES (1781093303431, 'Init1781093303431');` |
| Publication search empty on an old database | Search schema added later | `cd backend && npm run db:publication-search` |
| Equation rendering fails locally | No browser for the renderer | `cd backend && npx playwright install chromium`, or set `EQUATION_RENDER_MATHJAX_ONLY=1` |
