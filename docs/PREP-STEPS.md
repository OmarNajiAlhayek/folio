# Preparation checklist

Use this before running Folio locally. Full run instructions are in the repository [`README.md`](../README.md).

## Tooling

- **Node.js** — Current LTS recommended.
- **PostgreSQL** — Create a database (e.g. `folio_review`).
- **Docker** — Optional; needed if you run RabbitMQ via `docker-compose.dev.yml` for the email pipeline.
- **Python 3.12+** — Optional; needed if you run the ai-service for AI-assisted features.

## Configuration (copy examples; never commit secrets)

| Location | Copy from |
|----------|-----------|
| Backend | `backend/.env.example` → `backend/.env` |
| Frontend | `frontend/.env.local.example` → `frontend/.env.local` |
| Email service | `services/email-service/.env.example` → `services/email-service/.env` |
| AI service | `services/ai-service/.env.example` → `services/ai-service/.env` |

Set `DB_*`, `JWT_SECRET`, API URL / CORS as needed. **Mail:** only `services/email-service/.env` — never put `SMTP_*` or `EMAIL_PROVIDER` in `backend/.env` (the API refuses to start). For email in dev, `EMAIL_PROVIDER=noop` is enough for the email service.

**Production:** set `NODE_ENV=production` and replace example `JWT_SECRET` / `DB_PASSWORD` (both apps validate on startup). Use strong RabbitMQ credentials, not `guest:guest`.

## Run order (typical)

1. Optional: `docker compose -f docker-compose.dev.yml up -d` (RabbitMQ).
2. `cd backend` → `npm install` → `npm run seed` (if you use the seed) → `npm run start:dev`.
3. `cd frontend` → `npm install` → `npm run dev`.
4. Optional: `cd services/email-service` → `npm install` → `npm run start:dev`.
5. Optional: `cd services/ai-service` → venv → `pip install -e ".[dev]"` → `uvicorn app.main:app --reload --port 5245` (gRPC on **5246**). Enable matching flags in `backend/.env` (`AI_SERVICE_ENABLED`, etc.). See [`services/ai-service/README.md`](../services/ai-service/README.md).

Health: backend `/api/v1/health`; ai-service `http://localhost:5245/health` (see [`README.md`](../README.md) for ports).

## Further reading

- Features by role: [`feature-report.md`](./feature-report.md)
- Data model: [`DATA-MODEL.md`](./DATA-MODEL.md)
- API notes: [`API-NOTES.md`](./API-NOTES.md)
