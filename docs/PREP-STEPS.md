# Preparation checklist

Use this before running Damascus University Journal locally. Full run instructions are in the repository [`README.md`](../README.md).

## Tooling

- **Node.js** — Current LTS recommended.
- **PostgreSQL** — Create databases `folio_review` and `folio_email` on a native install (port **5432**), or use Docker via `docker-compose.dev.yml` (main DB on host **5434**, email DB on **5433**).
- **Docker** — Optional. **`docker-compose.infra.yml`** (recommended on Windows): RabbitMQ, LanguageTool, Typesense only. **`docker-compose.dev.yml`**: adds containerized Postgres. **`docker-compose.local.yml`**: full stack in Docker (heavy).
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

### Light Docker + native Postgres (recommended on Windows)

1. Create `folio_review` and `folio_email` on local Postgres (**5432**). Run [`scripts/setup-native-postgres.sql`](../scripts/setup-native-postgres.sql) or create manually. Enable **pgvector** on `folio_review` (`CREATE EXTENSION vector`) — required for backend migrations. Windows without pgvector: run [`scripts/install-pgvector-windows.bat`](../scripts/install-pgvector-windows.bat) as Administrator, restart PostgreSQL, then create the extension. The `email` schema must exist in `folio_email` before the first email-service migrate (`CREATE SCHEMA IF NOT EXISTS email;` — included in the SQL script).
2. `docker compose -f docker-compose.infra.yml up -d` — RabbitMQ, LanguageTool, Typesense only. Or use [`run-dev.bat`](../run-dev.bat) to start infra + app terminals.
3. `cd backend` → `npm install` → `npm run migrate` → `npm run seed` → `npm run start:dev`.
4. `cd frontend` → `npm install` → `npm run dev`.
5. Optional: `cd services/email-service` → `npm install` → `npm run migrate` → `npm run start:dev`.
6. Optional: `cd services/ai-service` → venv → `pip install -e ".[dev]"` → `uvicorn app.main:app --reload --port 5245` (gRPC on **5246**).

Set `DB_PORT=5432` in `backend/.env` and `services/email-service/.env` when using native Postgres.

### Containerized Postgres (docker-compose.dev.yml)

1. `docker compose -f docker-compose.dev.yml up -d` — PostgreSQL (host **5434**), PostgreSQL-email (host **5433**), RabbitMQ, LanguageTool, and Typesense. Start a single service with e.g. `... up -d typesense`. Use `DB_PORT=5434` / `5433` in `.env` files.
2. Same app steps as above (backend migrate/seed, frontend, email-service, ai-service).

### Full stack in Docker (avoid on low-RAM machines)

`docker compose -f docker-compose.local.yml up` — all services in containers. Do not run alongside other compose files (shared ports).

**Typesense (optional publication search):** once the Typesense container is running and `TYPESENSE_ENABLED=true` is set in `backend/.env`, the backend creates and syncs the collection automatically on startup. No manual schema step required.

Health: backend `/api/v1/health`; ai-service `http://localhost:5245/health` (see [`README.md`](../README.md) for ports).

## Further reading

- Documentation index: [`README.md`](./README.md)
- Features by role: [`feature-report.md`](./feature-report.md)
- Data model: [`DATA-MODEL.md`](./DATA-MODEL.md)
- API notes: [`API-NOTES.md`](./API-NOTES.md)
