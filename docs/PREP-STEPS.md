# Preparation checklist

Use this before running Folio locally. Full run instructions are in the repository [`README.md`](../README.md).

## Tooling

- **Node.js** — Current LTS recommended.
- **PostgreSQL** — Create a database (e.g. `folio_review`). Or use Docker (see below) — `postgres` service maps to host port **5434**.
- **Docker** — Optional; `docker-compose.dev.yml` provides all infrastructure: PostgreSQL (main + email), RabbitMQ, LanguageTool, and Typesense.
- **Python 3.12+** — Optional; needed if you run the ai-service for AI-assisted features.

### Repo root (optional but recommended)

```bash
npm install   # enables Husky pre-commit (Prettier + ESLint via lint-staged)
```

### Shared package

After editing `packages/shared/`, rebuild before running Nest apps or tests:

```bash
npm run build:shared
```

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

1. Optional: `docker compose -f docker-compose.dev.yml up -d` — starts PostgreSQL (host **5434**), PostgreSQL-email (host **5433**), RabbitMQ, LanguageTool, and Typesense. Start a single service with e.g. `... up -d typesense`. Alternatively run everything in Docker with `docker compose -f docker-compose.local.yml up`.
2. `cd backend` → `npm install` → `npm run migrate` → `npm run seed` (if you use the seed) → `npm run start:dev`.
3. `cd frontend` → `npm install` → `npm run dev`.
4. Optional: `cd services/email-service` → `npm install` → `npm run start:dev`.
5. Optional: `cd services/ai-service` → venv → `pip install -e ".[dev]"` → `uvicorn app.main:app --reload --port 5245` (gRPC on **5246**). Enable matching flags in `backend/.env` (`AI_SERVICE_ENABLED`, etc.). See [`services/ai-service/README.md`](../services/ai-service/README.md).

**Typesense (optional publication search):** once the Typesense container is running and `TYPESENSE_ENABLED=true` is set in `backend/.env`, the backend creates and syncs the collection automatically on startup. No manual schema step required.

Health: backend `/api/v1/health`; ai-service `http://localhost:5245/health` (see [`README.md`](../README.md) for ports).

## Further reading

- Documentation index: [`README.md`](./README.md)
- Features by role: [`feature-report.md`](./feature-report.md)
- Data model: [`DATA-MODEL.md`](./DATA-MODEL.md)
- API notes: [`API-NOTES.md`](./API-NOTES.md)
