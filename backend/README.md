# Folio backend (NestJS)

HTTP API for the Folio peer-review workspace. Global prefix: **`/api/v1`**.

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

| Topic | Doc |
|-------|-----|
| REST contract | [`../docs/API-NOTES.md`](../docs/API-NOTES.md) |
| Data model | [`../docs/DATA-MODEL.md`](../docs/DATA-MODEL.md) |
| Email pipeline | [`../docs/testing-email-pipeline.md`](../docs/testing-email-pipeline.md) |
| AI integration | [`../docs/plans/ai-service.md`](../docs/plans/ai-service.md) |

## Tests

```bash
npm test
npm run test:e2e
```
