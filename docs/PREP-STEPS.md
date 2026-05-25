# Preparation checklist

Use this before running Folio locally. Full run instructions are in the repository [`README.md`](../README.md).

## Tooling

- **Node.js** — Current LTS recommended.
- **PostgreSQL** — Create a database (e.g. `folio_review`).
- **Docker** — Optional; needed if you run RabbitMQ via `docker-compose.dev.yml` for the email pipeline.

## Configuration (copy examples; never commit secrets)

| Location | Copy from |
|----------|-----------|
| Backend | `backend/.env.example` → `backend/.env` |
| Frontend | `frontend/.env.local.example` → `frontend/.env.local` |
| Email service | `services/email-service/.env.example` → `services/email-service/.env` |

Set `DB_*`, `JWT_SECRET`, API URL / CORS as needed. **Mail:** only `services/email-service/.env` — never put `SMTP_*` or `EMAIL_PROVIDER` in `backend/.env` (the API refuses to start). For email in dev, `EMAIL_PROVIDER=noop` is enough for the email service.

**Production:** set `NODE_ENV=production` and replace example `JWT_SECRET` / `DB_PASSWORD` (both apps validate on startup). Use strong RabbitMQ credentials, not `guest:guest`.

## Run order (typical)

1. Optional: `docker compose -f docker-compose.dev.yml up -d` (RabbitMQ).
2. `cd backend` → `npm install` → `npm run seed` (if you use the seed) → `npm run start:dev`.
3. `cd frontend` → `npm install` → `npm run dev`.
4. Optional: `cd services/email-service` → `npm install` → `npm run start:dev`.

Health: backend `/api/v1/health` (see [`README.md`](../README.md) for ports).

## Further reading

- Features by role: [`feature-report.md`](./feature-report.md)
- Data model: [`DATA-MODEL.md`](./DATA-MODEL.md)
- API notes: [`API-NOTES.md`](./API-NOTES.md)
