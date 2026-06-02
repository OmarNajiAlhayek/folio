# Folio documentation index

Central map of specs, runbooks, and design records. For local setup and sample accounts, start with the repository [`README.md`](../README.md).

## Core specs

| Document | Purpose |
|----------|---------|
| [`PROJECT-CONTEXT.md`](./PROJECT-CONTEXT.md) | Product scope, stack, optional OJS reference |
| [`feature-report.md`](./feature-report.md) | Features and workflows by role |
| [`DATA-MODEL.md`](./DATA-MODEL.md) | Entities, submission lifecycle, ERD |
| [`API-NOTES.md`](./API-NOTES.md) | REST contract, auth, rate limits, events, notifications |
| [`PREP-STEPS.md`](./PREP-STEPS.md) | Prerequisites and run-order checklist |

## Plans and design records

| Document | Purpose |
|----------|---------|
| [`plans/ai-service.md`](./plans/ai-service.md) | AI microservice architecture, gRPC services, feature flags |
| [`plans/email-service.md`](./plans/email-service.md) | Email pipeline, RabbitMQ topology, handler state machine |
| [`plans/email-phase-2-events.md`](./plans/email-phase-2-events.md) | Submission/decision email design (implemented) |
| [`plans/word-constructor.md`](./plans/word-constructor.md) | In-app manuscript builder |
| [`plans/playwright-constructor-e2e.md`](./plans/playwright-constructor-e2e.md) | Word Constructor E2E coverage plan |

## Operator runbooks

| Document | Purpose |
|----------|---------|
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

## Local infrastructure (Docker Compose)

[`docker-compose.dev.yml`](../docker-compose.dev.yml) provides:

- **RabbitMQ** — AMQP `5672`, management UI `http://localhost:15672` (email pipeline)
- **LanguageTool** — HTTP `http://localhost:8010` (copyedit grammar/spelling; Nest-only, not ai-service)

Start all: `docker compose -f docker-compose.dev.yml up -d`. Start LanguageTool alone: `... up -d languagetool`.
