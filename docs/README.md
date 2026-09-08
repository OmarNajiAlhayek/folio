# Documentation index

Central map of the Folio (Damascus University Journal) documentation. New here? Read
[`ARCHITECTURE.md`](./ARCHITECTURE.md), then [`DEVELOPMENT.md`](./DEVELOPMENT.md).

## Getting started

| Document | Purpose |
|----------|---------|
| [`../README.md`](../README.md) | Project overview, components, quick start |
| [`DEVELOPMENT.md`](./DEVELOPMENT.md) | Local setup (four variants), sample accounts, tests, migrations, troubleshooting |
| [`PREP-STEPS.md`](./PREP-STEPS.md) | Condensed prerequisites and run-order checklist |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Branches, commits, what a change must include, PR checklist |

## Architecture and operations

| Document | Purpose |
|----------|---------|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Components, communication boundaries, outbox flow, AI paths, design decisions |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Container images, compose stack, migrations, backups, hardening |
| [`CONFIGURATION.md`](./CONFIGURATION.md) | Every environment variable, per component |
| [`../SECURITY.md`](../SECURITY.md) | Security model, secret handling, vulnerability reporting |
| [`OBSERVABILITY.md`](./OBSERVABILITY.md) | Structured logs, trace/request correlation, OTLP export |
| [`slo.md`](./slo.md) | Production SLO tiers (distinct from local perf baselines) |
| [`EXTERNAL-ACTIONS.md`](./EXTERNAL-ACTIONS.md) | Registrations, fees and institutional decisions that cannot be done from the repository |

## Product and API

| Document | Purpose |
|----------|---------|
| [`PRODUCT-SPECIFICATION.md`](./PRODUCT-SPECIFICATION.md) | **As-built product spec** — vision, roles, workflows, features |
| [`PROJECT-CONTEXT.md`](./PROJECT-CONTEXT.md) | Product scope, stack, optional OJS reference |
| [`feature-report.md`](./feature-report.md) | Features and workflows by role |
| [`DATA-MODEL.md`](./DATA-MODEL.md) | Entities, submission lifecycle, ERD |
| [`API-NOTES.md`](./API-NOTES.md) | REST contract, auth, rate limits, events, notifications |
| [`authorization.md`](./authorization.md) | RBAC layers — route guard vs service caller/resource checks |
| [`AI-FEATURES.md`](./AI-FEATURES.md) | End-to-end guide to each AI product feature |

## Design records

| Document | Purpose |
|----------|---------|
| [`plans/ai-service.md`](./plans/ai-service.md) | AI microservice architecture, gRPC services, feature flags |
| [`plans/email-service.md`](./plans/email-service.md) | Email pipeline, RabbitMQ topology, handler state machine |
| [`plans/email-phase-2-events.md`](./plans/email-phase-2-events.md) | Submission/decision email design (implemented) |
| [`plans/word-constructor.md`](./plans/word-constructor.md) | In-app manuscript builder — design, limitations, extension guide |
| [`plans/playwright-constructor-e2e.md`](./plans/playwright-constructor-e2e.md) | Word Constructor E2E coverage plan |

## Runbooks and testing

| Document | Purpose |
|----------|---------|
| [`testing-email-pipeline.md`](./testing-email-pipeline.md) | Email admin API, pipeline smoke tests, DLQ/requeue runbooks |
| [`testing-performance.md`](./testing-performance.md) | k6/gRPC perf harness, DB snapshots, thresholds, CI |
| [`../perf/README.md`](../perf/README.md) | Perf suite catalogue and fixture tuning |
| [`../email-details.md`](../email-details.md) | Informal email walkthrough (may drift — prefer `plans/email-service.md`) |

## Component documentation

| Path | Purpose |
|------|---------|
| [`../backend/README.md`](../backend/README.md) | Nest API — run, test, migrate |
| [`../frontend/README.md`](../frontend/README.md) | Next.js app — run, test, build |
| [`../services/ai-service/README.md`](../services/ai-service/README.md) | AI service setup, extras, grpcurl smoke tests |
| [`../services/email-service/README.md`](../services/email-service/README.md) | Email worker setup, health port, migrations |
| [`../packages/shared/README.md`](../packages/shared/README.md) | Shared event contracts and sync commands |
| [`../proto/README.md`](../proto/README.md) | Protobuf contracts and code generation |

## Styles and diagrams

| Path | Purpose |
|------|---------|
| [`styles/damascus-university-journal-v1.md`](./styles/damascus-university-journal-v1.md) | Default manuscript style profile |
| [`diagrams/use-cases/`](./diagrams/use-cases/) | PlantUML use-case diagrams by role |
| [`diagrams/sequences/`](./diagrams/sequences/) | PlantUML sequence diagrams (peer review) |
| [`diagrams/activities/`](./diagrams/activities/) | PlantUML activity diagrams |
| [`diagrams/erd/`](./diagrams/erd/) · [`diagrams/erd-by-role/`](./diagrams/erd-by-role/) | Mermaid ER diagrams by domain and by role |
| [`diagrams/class/`](./diagrams/class/) · [`diagrams/class-by-role/`](./diagrams/class-by-role/) | PlantUML class diagrams (TypeORM entities) |
| [`diagrams/blocks/ai/`](./diagrams/blocks/ai/) | Mermaid block diagrams for AI features |

---

## Compose files at a glance

| File | Contains | Use |
|------|----------|-----|
| [`../docker-compose.yml`](../docker-compose.yml) | Everything, built images, no bind mounts | **Deployment** — [`DEPLOYMENT.md`](./DEPLOYMENT.md) |
| [`../docker-compose.infra.yml`](../docker-compose.infra.yml) | RabbitMQ, LanguageTool, Typesense | Native app services **and** native Postgres (lightest on Windows) |
| [`../docker-compose.dev.yml`](../docker-compose.dev.yml) | The above + Postgres (5434) and Postgres-email (5433) | Native app services, containerised state |
| [`../docker-compose.local.yml`](../docker-compose.local.yml) | Everything with hot-reload bind mounts | One-command local stack; heavy on Windows |
| [`../docker-compose.perf.yml`](../docker-compose.perf.yml) | Perf-harness fixtures | [`testing-performance.md`](./testing-performance.md) |

**Run one at a time** — they share ports 5432/5434, 5672 and 15672.
