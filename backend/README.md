# Damascus University Journal backend (NestJS)

HTTP API for the Damascus University Journal peer-review workspace. Global prefix: **`/api/v1`**.

## Quick start

```bash
npm install
cp .env.example .env   # set DB_*, JWT_SECRET, etc.
npm run seed
npm run start:dev
```

- API: `http://localhost:5243`
- Swagger: `http://localhost:5243/api-docs`
- Health: `http://localhost:5243/api/v1/health`

## Documentation

Monorepo overview, all services, and sample accounts: [`../README.md`](../README.md).

| Topic               | Doc                                                                      |
| ------------------- | ------------------------------------------------------------------------ |
| REST contract       | [`../docs/API-NOTES.md`](../docs/API-NOTES.md)                           |
| Data model          | [`../docs/DATA-MODEL.md`](../docs/DATA-MODEL.md)                         |
| Email pipeline      | [`../docs/testing-email-pipeline.md`](../docs/testing-email-pipeline.md) |
| AI integration      | [`../docs/plans/ai-service.md`](../docs/plans/ai-service.md)             |
| Documentation index | [`../docs/README.md`](../docs/README.md)                                 |
| Copyedit workflow   | [`../docs/API-NOTES.md`](../docs/API-NOTES.md#copyediting)               |

## Container image

Production image, built from the **repository root** — the API links `packages/shared` and
`packages/nest-observability` through npm `file:` paths that a `backend/`-scoped build context
cannot resolve:

```bash
docker build -f backend/Dockerfile -t folio/backend .
```

Multi-stage: linked packages compiled first, then the API, then a runtime stage with only
`dist` and production dependencies — non-root (uid 1001), `dumb-init` as PID 1, healthcheck on
`/api/v1/health`. The default image has no browser, so it sets
`EQUATION_RENDER_MATHJAX_ONLY=1`; build with `--build-arg WITH_CHROMIUM=true` and set it to `0`
for the Chromium equation renderer.

Migrations run at startup unless `DB_MIGRATE_ON_START=false`; run them explicitly with
`npm run migrate:prod` (compiled migrations from `dist/db/migrations`).

Full stack and operations: [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).

## Tests

```bash
npm test
npm run test:e2e
npm run test:pipeline   # opt-in: assign → outbox → RabbitMQ (see docs/testing-email-pipeline.md)
npm run test:ai-jobs    # opt-in: AI job → outbox → RabbitMQ → worker (needs Postgres + RabbitMQ + ai-service)
```

### Optional: copyedit gRPC smoke

With ai-service running and `AI_COPYEDIT_ENABLED=true`:

```bash
npx ts-node scripts/smoke-copyedit-grpc.ts
```
