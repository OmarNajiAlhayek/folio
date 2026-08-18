# Folio — Damascus University Journal

Scholarly **manuscript submission and peer-review** workspace for the Damascus University
Journal: submission (upload or in-app manuscript builder), editorial workflow, double-blind
peer review, copyediting, publication, and a bilingual **Arabic/English** interface with full
RTL support.

Concepts are OJS-inspired; the implementation is original.

[![CI](https://github.com/OmarNajiAlhayek/folio/actions/workflows/ci.yml/badge.svg)](https://github.com/OmarNajiAlhayek/folio/actions/workflows/ci.yml)

---

## Components

| Component | Stack | Port | Responsibility |
|-----------|-------|------|----------------|
| [`frontend/`](frontend/) | Next.js (App Router, next-intl, Tailwind v4) | 5240 | Browser UI, i18n + RTL, server-side API proxy |
| [`backend/`](backend/) | NestJS + TypeORM + PostgreSQL | 5243 | Domain model, auth, RBAC, workflow, uploads, event outbox |
| [`services/email-service/`](services/email-service/) | NestJS worker | 5244 | Transactional email, templates, review reminders |
| [`services/ai-service/`](services/ai-service/) | Python FastAPI + gRPC | 5245 / 5246 | Classification, keywords, similarity, plagiarism, reviewer matching |
| [`packages/shared/`](packages/shared/) | TypeScript library | — | Event contracts, RabbitMQ topology, idempotency keys, entity IDs |
| [`packages/nest-observability/`](packages/nest-observability/) | TypeScript library | — | Structured logging, trace correlation, OTLP export |
| [`proto/`](proto/) | Protobuf + Buf | — | backend ↔ ai-service gRPC contract |

Infrastructure: PostgreSQL (two databases), RabbitMQ, and — optional and feature-flagged —
LanguageTool and Typesense.

```
browser → frontend :5240 ──(server-side rewrite)──→ backend :5243 ──→ PostgreSQL
                                                        │  ├─ gRPC  → ai-service :5246
                                                        │  └─ AMQP  → RabbitMQ → email-service :5244
```

The browser never calls the API, ai-service or email-service directly — the access token stays
in an httpOnly cookie. Full picture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Quick start

### Run the stack in containers

```bash
cp docker/.env.example .env      # fill in the REQUIRED secrets block
docker compose build
docker compose up -d
```

App on `http://localhost:5240`. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

### Develop with hot reload

```bash
docker compose -f docker-compose.infra.yml up -d      # RabbitMQ, LanguageTool, Typesense
cd backend  && npm install && npm run migrate && npm run seed && npm run start:dev
cd frontend && npm install && npm run dev
```

Requires PostgreSQL with `folio_review` + `folio_email` and the pgvector extension. Full setup —
including the containerised-Postgres and all-in-Docker variants, sample accounts, and the
optional email/AI services — is in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md). On Windows,
[`run-dev.bat`](run-dev.bat) starts infrastructure and one terminal per service.

**Run one compose file at a time** — they share ports.

---

## Documentation

| Start here | |
|------------|--|
| [`docs/README.md`](docs/README.md) | Full documentation index |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Components, boundaries, event flow, design decisions |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Local setup, tests, migrations, codegen, troubleshooting |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Images, compose stack, operations, hardening |
| [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) | Every environment variable, per service |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Workflow, conventions, review expectations |

| Product and API | |
|-----------------|--|
| [`docs/PRODUCT-SPECIFICATION.md`](docs/PRODUCT-SPECIFICATION.md) | As-built product spec — roles, workflows, features |
| [`docs/feature-report.md`](docs/feature-report.md) | Features and workflows by role |
| [`docs/API-NOTES.md`](docs/API-NOTES.md) | REST contract, auth, rate limits, events |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Entities, submission lifecycle, ERD |
| [`docs/authorization.md`](docs/authorization.md) | RBAC layers — route guard vs resource checks |
| [`docs/AI-FEATURES.md`](docs/AI-FEATURES.md) | End-to-end guide to each AI feature |

Runbooks (observability, email pipeline, performance, SLOs) and design records are indexed in
[`docs/README.md`](docs/README.md).

---

## Repository layout

```
backend/                     NestJS API (/api/v1)
frontend/                    Next.js app
services/email-service/      RabbitMQ consumer, reminders, templates
services/ai-service/         FastAPI + gRPC AI microservice
packages/shared/             @folio/shared — cross-service contracts
packages/nest-observability/ logging and tracing wiring
proto/                       Protobuf contracts (generated stubs committed)
docs/                        Specs, runbooks, design records, diagrams
perf/                        k6 + gRPC performance harness
docker/                      Postgres init SQL, stack .env template
scripts/                     Native Postgres / pgvector bootstrap (Windows)
uploads/                     Manuscript storage, created at runtime (gitignored)
```

---

## Conventions

- **Shared code, not copied code.** Event contracts and messaging helpers live in
  `packages/shared` and are linked with npm `file:` — run `npm run build:shared` after editing.
- **Migrations, not `synchronize`.** Schema changes ship as TypeORM migrations.
- **Mail configuration lives only in email-service.** The API refuses to start with `SMTP_*` or
  `EMAIL_PROVIDER` in its environment.
- **Optional features are double-flagged.** An AI capability needs its flag on the API *and* on
  ai-service; the deployment runs fine with all of them off.
- **RTL is not an afterthought.** Use logical CSS properties (`ps-*`, `pe-*`, `ms-*`, `me-*`,
  `start-*`, `end-*`) so Arabic layout works without overrides.
- **Generated protobuf stubs are committed.** Only contributors editing `.proto` need Buf.
- Root `npm install` installs the Husky pre-commit hook (Prettier + ESLint on staged files).

---

## Tests

```bash
cd backend  && npm test            # unit
cd backend  && npm run test:e2e
cd frontend && npm run test:unit   # vitest
cd frontend && npm run test:e2e    # playwright (starts both servers)
cd services/ai-service && pytest
npm run test:perf                  # k6 + gRPC harness (repo root)
```

Integration suites that need a database, broker or the Python service are opt-in behind
environment flags. CI (`.github/workflows/ci.yml`) runs proto lint + stub-freshness, backend,
frontend, email-service, shared package and ai-service checks on every push.

---

## Security

Never commit secrets: `.env` files are gitignored and `.env.example` files carry placeholders
only. Reporting and hardening guidance: [`SECURITY.md`](SECURITY.md) and
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#4-production-hardening-checklist).
