# Folio email service

Standalone NestJS worker that consumes RabbitMQ events from the main API, renders Handlebars templates, and sends transactional mail (reviewer invites, copyedit, editorial workflow, role invitations) plus scheduled review reminders.

Design record: [`docs/plans/email-service.md`](../../docs/plans/email-service.md). Operator runbooks and smoke tests: [`docs/testing-email-pipeline.md`](../../docs/testing-email-pipeline.md).

## Prerequisites

- Node.js LTS
- PostgreSQL (same database as the backend; this app uses schema **`email`**)
- RabbitMQ (local: `docker compose -f docker-compose.dev.yml up -d` from repo root)

## Setup

```bash
cd services/email-service
npm install
cp .env.example .env
```

Set `DB_*` to match [`backend/.env`](../../backend/.env) (database name must be the same). Set `RABBITMQ_URL` / `RABBITMQ_EXCHANGE` to match the backend. Default `EMAIL_PROVIDER=noop` logs would-be sends — no SMTP required in dev.

**Mail config lives only here** — never put `SMTP_*` or `EMAIL_PROVIDER` in `backend/.env`.

If the backend DB user is restricted, apply [`backend/scripts/grant-email-reminder-admin.sql`](../../backend/scripts/grant-email-reminder-admin.sql) after the first startup so journal-manager email admin APIs can read `email.*`.

## Run locally

Start **RabbitMQ**, then the **backend**, then this worker:

```bash
npm run start:dev
```

On startup the worker:

1. Creates schema `email` if missing
2. Runs TypeORM migrations (templates, reminder policy, `email_log`, etc.)
3. Connects to RabbitMQ and starts consuming
4. Starts the reminder scheduler (`@Cron` every minute)
5. Exposes health on **`http://127.0.0.1:5244`**

Health checks:

```bash
curl http://127.0.0.1:5244/health
curl http://127.0.0.1:5244/ready
```

There is no product HTTP API — only health probes and background consumption.

## What it consumes

Events on exchange `folio.events` (see [`packages/shared/messaging/topology.ts`](../../packages/shared/messaging/topology.ts)):

| Routing key | Effect |
|-------------|--------|
| `reviewer.invited` | Invite email + schedule due-soon / overdue reminders |
| `reminder.due` | Send reminder email |
| `copyedit.*` | Copyeditor assignment, author queries, author-ready |
| `submission.submitted` / `submission.decision` / `submission.published` | Editorial workflow mail |
| `review.submitted` / `review.invitation_*` | Review activity → editors and journal managers |
| `role.invitation` | Staff role invite |

Full producer/consumer matrix: [`docs/API-NOTES.md`](../../docs/API-NOTES.md) § Eventing.

## Migrations

Migrations run automatically on startup. To run manually:

```bash
npm run migrate
```

After editing shared contracts under `packages/shared/`, sync mirrors:

```bash
npm run sync:shared    # from repo root: npm run sync:shared
npm run check:shared   # CI drift check
```

## Tests

```bash
npm test
```

RabbitMQ is mocked in unit tests. For a real broker smoke test from the backend, see [`docs/testing-email-pipeline.md`](../../docs/testing-email-pipeline.md) (`npm run test:pipeline` in `backend/`).

## Shared code

Event types and RabbitMQ topology are authored in [`packages/shared/`](../../packages/shared/) and mirrored into `src/shared/` in this app. Edit the canonical package first, then `npm run sync:shared` from the repo root.

## Documentation

| Topic | Doc |
|-------|-----|
| Architecture & handler state machine | [`docs/plans/email-service.md`](../../docs/plans/email-service.md) |
| Phase 2 submission/decision design | [`docs/plans/email-phase-2-events.md`](../../docs/plans/email-phase-2-events.md) |
| Admin templates & pipeline ops | [`docs/testing-email-pipeline.md`](../../docs/testing-email-pipeline.md) |
| Monorepo run order | [`README.md`](../../README.md) |
