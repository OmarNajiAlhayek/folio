# Damascus University Journal email service

Standalone NestJS worker that consumes RabbitMQ events from the main API, renders Handlebars templates, and sends transactional mail (reviewer invites, copyedit, editorial workflow, role invitations) plus scheduled review reminders.

Design record: [`docs/plans/email-service.md`](../../docs/plans/email-service.md). Operator runbooks and smoke tests: [`docs/testing-email-pipeline.md`](../../docs/testing-email-pipeline.md).

## Prerequisites

- Node.js LTS
- PostgreSQL **`folio_email`** (dedicated instance; default host port **5433** via `docker compose -f docker-compose.dev.yml up -d postgres-email`)
- RabbitMQ (local: `docker compose -f docker-compose.dev.yml up -d` from repo root)

## Setup

```bash
cd services/email-service
npm install
cp .env.example .env
```

Set `DB_*` for the email Postgres instance (`DB_PORT=5433` when using docker-compose `postgres-email`). Set `RABBITMQ_URL` / `RABBITMQ_EXCHANGE` to match the backend. Set `EMAIL_SERVICE_TOKEN` to match `backend/.env` when binding beyond loopback. Default `EMAIL_PROVIDER=noop` logs would-be sends — no SMTP required in dev.

**Mail config lives only here** — never put `SMTP_*` or `EMAIL_PROVIDER` in `backend/.env`.

## Run locally

Start **postgres-email**, **RabbitMQ**, then the **backend**, then this worker:

```bash
npm run start:dev
```

On startup the worker:

1. Creates schema `email` if missing
2. Runs TypeORM migrations (templates, reminder policy, `email_log`, etc.)
3. Connects to RabbitMQ and starts consuming
4. Starts the reminder scheduler (`@Cron` every minute)
5. Listens on **`http://127.0.0.1:5244`** — health probes and **`/internal/*`** admin API (called by Nest with `x-folio-service-token`)

Health checks:

```bash
curl http://127.0.0.1:5244/health
curl http://127.0.0.1:5244/ready
```

Journal managers use the backend BFF (`/api/v1/admin/email/*`); the browser never calls email-service directly.

## What it consumes

Events on exchange `folio.events` (see [`packages/shared/messaging/topology.ts`](../../packages/shared/messaging/topology.ts)):

| Routing key                                                             | Effect                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------- |
| `reviewer.invited`                                                      | Invite email + schedule due-soon / overdue reminders |
| `reminder.due`                                                          | Send reminder email                                  |
| `copyedit.*`                                                            | Copyeditor assignment, author queries, author-ready  |
| `submission.submitted` / `submission.decision` / `submission.published` | Editorial workflow mail                              |
| `review.submitted` / `review.invitation_*`                              | Review activity → editors and journal managers       |
| `role.invitation`                                                       | Staff role invite                                    |

Full producer/consumer matrix: [`docs/API-NOTES.md`](../../docs/API-NOTES.md) § Eventing.

## Migrations

Migrations run automatically on startup. To run manually:

```bash
npm run migrate
```

After editing shared contracts under `packages/shared/`, sync mirrors:

```bash
npm run build:shared   # from repo root, after editing packages/shared
```

## Tests

```bash
npm test
```

RabbitMQ is mocked in unit tests. For a real broker smoke test from the backend, see [`docs/testing-email-pipeline.md`](../../docs/testing-email-pipeline.md) (`npm run test:pipeline` in `backend/`).

## Shared code

Event types and RabbitMQ topology are imported from [`@folio/shared`](../../packages/shared/). Edit the canonical package, then `npm run build:shared` from the repo root.

## Documentation

| Topic                                | Doc                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| Architecture & handler state machine | [`docs/plans/email-service.md`](../../docs/plans/email-service.md)               |
| Phase 2 submission/decision design   | [`docs/plans/email-phase-2-events.md`](../../docs/plans/email-phase-2-events.md) |
| Admin templates & pipeline ops       | [`docs/testing-email-pipeline.md`](../../docs/testing-email-pipeline.md)         |
| Monorepo run order                   | [`README.md`](../../README.md)                                                   |
