# Damascus University Journal documentation index

Central map of specs, runbooks, and design records. For local setup and sample accounts, start with the repository [`README.md`](../README.md).

## Core specs

| Document | Purpose |
|----------|---------|
| [`PRODUCT-SPECIFICATION.md`](./PRODUCT-SPECIFICATION.md) | **As-built product spec** — vision, roles, workflows, features (verified against codebase) |
| [`PROJECT-CONTEXT.md`](./PROJECT-CONTEXT.md) | Product scope, stack, optional OJS reference |
| [`feature-report.md`](./feature-report.md) | Features and workflows by role |
| [`DATA-MODEL.md`](./DATA-MODEL.md) | Entities, submission lifecycle, ERD |
| [`API-NOTES.md`](./API-NOTES.md) | REST contract, auth, rate limits, events, notifications |
| [`authorization.md`](./authorization.md) | RBAC layers — route guard vs service caller/resource checks |
| [`PREP-STEPS.md`](./PREP-STEPS.md) | Prerequisites and run-order checklist |

## Plans and design records

| Document | Purpose |
|----------|---------|
| [`plans/ai-service.md`](./plans/ai-service.md) | AI microservice architecture, gRPC services, feature flags |
| [`AI-FEATURES.md`](./AI-FEATURES.md) | Detailed end-to-end guide for each AI product feature |
| [`plans/email-service.md`](./plans/email-service.md) | Email pipeline, RabbitMQ topology, handler state machine |
| [`plans/email-phase-2-events.md`](./plans/email-phase-2-events.md) | Submission/decision email design (implemented) |
| [`plans/word-constructor.md`](./plans/word-constructor.md) | In-app manuscript builder |
| [`plans/playwright-constructor-e2e.md`](./plans/playwright-constructor-e2e.md) | Word Constructor E2E coverage plan |

## Operator runbooks

| Document | Purpose |
|----------|---------|
| [`OBSERVABILITY.md`](./OBSERVABILITY.md) | Structured JSON logs, trace/request correlation, OTLP export |
| [`testing-performance.md`](./testing-performance.md) | k6/gRPC perf harness, DB snapshots, thresholds, CI |
| [`slo.md`](./slo.md) | Production SLO tiers (separate from local perf baselines) |
| [`testing-email-pipeline.md`](./testing-email-pipeline.md) | Email admin API, pipeline smoke tests, DLQ/requeue runbooks |
| [`../email-details.md`](../email-details.md) | Informal email walkthrough (may drift — prefer `plans/email-service.md`) |

## Service READMEs (outside `docs/`)

| Path | Purpose |
|------|---------|
| [`../services/ai-service/README.md`](../services/ai-service/README.md) | AI service setup, grpcurl smoke tests, copyedit gRPC smoke script |
| [`../services/email-service/README.md`](../services/email-service/README.md) | Email worker setup, health port, migrations |
| [`../backend/README.md`](../backend/README.md) | Nest API quick start |
| [`../frontend/README.md`](../frontend/README.md) | Next.js app |
| [`../proto/README.md`](../proto/README.md) | Protobuf contracts and code generation |
| [`../packages/shared/README.md`](../packages/shared/README.md) | Shared event contracts and sync commands |

## Styles and diagrams

| Path | Purpose |
|------|---------|
| [`styles/damascus-university-journal-v1.md`](./styles/damascus-university-journal-v1.md) | Default manuscript style profile |
| [`diagrams/use-cases/`](./diagrams/use-cases/) | PlantUML use-case diagrams by role |
| [`diagrams/sequences/`](./diagrams/sequences/) | PlantUML sequence diagrams (peer review) |
| [`diagrams/activities/`](./diagrams/activities/) | PlantUML activity diagrams |
| [`diagrams/erd/`](./diagrams/erd/) | Mermaid ER diagrams (by domain) |
| [`diagrams/erd-by-role/`](./diagrams/erd-by-role/) | Mermaid ER diagrams (by role) |
| [`diagrams/class/`](./diagrams/class/) | PlantUML class diagrams (TypeORM entities, by domain) |
| [`diagrams/class-by-role/`](./diagrams/class-by-role/) | PlantUML class diagrams (by role) |
| [`diagrams/blocks/ai/`](./diagrams/blocks/ai/) | Mermaid block diagrams for AI features |

## Local infrastructure (Docker Compose)

### Light Docker (recommended on Windows)

[`docker-compose.infra.yml`](../docker-compose.infra.yml) — RabbitMQ, LanguageTool, and Typesense only. Run Postgres natively (`folio_review` + `folio_email` on port **5432**). See [`run-dev.bat`](../run-dev.bat).

```bash
docker compose -f docker-compose.infra.yml up -d
```

| Service | Port | Purpose |
|---------|------|---------|
| `rabbitmq` | AMQP **5672**, UI **15672** (guest/guest) | Event bus for email pipeline |
| `languagetool` | **8010** | Copyedit grammar/spelling (`LANGUAGE_TOOL_ENABLED=true`) |
| `typesense` | **8108** | Full-text publication search (`TYPESENSE_ENABLED=true`; API key `xyz` by default) |

### Containerized Postgres (`docker-compose.dev.yml`)

[`docker-compose.dev.yml`](../docker-compose.dev.yml) adds Postgres containers (start all or individually):

| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | host **5434** → container 5432 | Main app DB (`folio_review`); `pgvector/pgvector:pg17` image |
| `postgres-email` | host **5433** → container 5432 | Email service DB (`folio_email`) |
| `rabbitmq` | AMQP **5672**, UI **15672** (guest/guest) | Event bus for email pipeline |
| `languagetool` | **8010** | Copyedit grammar/spelling (`LANGUAGE_TOOL_ENABLED=true`) |
| `typesense` | **8108** | Full-text publication search (`TYPESENSE_ENABLED=true`; API key `xyz` by default) |

```bash
docker compose -f docker-compose.dev.yml up -d              # all services
docker compose -f docker-compose.dev.yml up -d typesense    # single service
```

**Full stack in Docker:** [`docker-compose.local.yml`](../docker-compose.local.yml) runs infra + all app services together. Avoid on low-RAM Windows hosts. Do **not** run multiple compose files at the same time (shared ports).
