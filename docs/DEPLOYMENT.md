# Deployment

Building, running and operating Folio in containers. For local development setups
see [`DEVELOPMENT.md`](./DEVELOPMENT.md); for every environment variable see
[`CONFIGURATION.md`](./CONFIGURATION.md).

---

## 1. Images

| Image | Dockerfile | Build context | Base | Runs as |
|-------|-----------|---------------|------|---------|
| `folio/backend` | `backend/Dockerfile` | **repository root** | `node:22-bookworm-slim` | `folio` (uid 1001) |
| `folio/frontend` | `frontend/Dockerfile` | **repository root** | `node:22-bookworm-slim` | `folio` (uid 1001) |
| `folio/email-service` | `services/email-service/Dockerfile` | **repository root** | `node:22-bookworm-slim` | `folio` (uid 1001) |
| `folio/ai-service` | `services/ai-service/Dockerfile` | `services/ai-service` | `python:3.12-slim-bookworm` | `folio` (uid 1001) |

### Why the Node images build from the repository root

`backend`, `frontend` and `email-service` depend on `packages/shared` (and
`packages/nest-observability`) through npm `file:` links that point **outside** their own
directory. A service-scoped build context cannot resolve them — `npm ci` fails on the
`@folio/*` dependencies. Each Dockerfile therefore expects the repo root as context:

```bash
docker build -f backend/Dockerfile               -t folio/backend .
docker build -f frontend/Dockerfile              -t folio/frontend .
docker build -f services/email-service/Dockerfile -t folio/email-service .
docker build                                      -t folio/ai-service services/ai-service
```

`docker compose build` does this for you.

### Stage layout (all three Node images)

```
base ──> workspace ──> build ──────┐
          (packages/*     (app       ├──> runtime   dist + prod node_modules only
           installed       compiled) │              non-root, dumb-init, healthcheck
           and compiled)  prod-deps ─┘
```

Compilers (`python3 make g++`, needed by `bcrypt` and `sharp`) exist only in intermediate
stages. The runtime stage contains no toolchain, no dev dependencies, no source.

### Build arguments

| Image | Argument | Default | Effect |
|-------|----------|---------|--------|
| backend | `WITH_CHROMIUM` | `false` | `true` installs Chromium for the browser equation renderer. Then set `EQUATION_RENDER_MATHJAX_ONLY=0` at runtime. |
| frontend | `NEXT_PUBLIC_API_URL` | empty | Inlined into the client bundle at build time. Empty = same-origin `/api/v1` via the Next.js rewrite (recommended). |
| frontend | `NEXT_PUBLIC_SENTRY_DSN` | empty | Inlined into the client bundle at build time. |
| ai-service | `PIP_EXTRAS` | `corpus` | Python extras to install — see below. |

`NEXT_PUBLIC_*` values are **compile-time**. Changing them requires a rebuild, not a restart.

### ai-service size is a build-time decision

| `PIP_EXTRAS` | Approx. image | Enables |
|--------------|---------------|---------|
| `corpus` (default) | ~250 MB | Exact-overlap plagiarism, corpus importers |
| `corpus,similarity` | ~3 GB | + embeddings, related articles, reviewer matching |
| `corpus,similarity,ml` | ~3.5 GB | + AraBERT discipline classifier |
| `+ web_similarity` | + ~50 MB | + Google CSE web plagiarism stage |

Installing an extra only makes the code available; the matching env flag still has to be on.
AraBERT additionally needs fine-tuned weights mounted at `ARABERT_MODEL_PATH` — they are not
in the repository and not in the image.

---

## 2. First deployment

```bash
cp docker/.env.example .env
# fill in the REQUIRED block (secrets + public URLs)
docker compose build
docker compose up -d
docker compose ps
```

Generate each secret separately — never reuse one value across two variables:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Required with no default (`docker compose config` fails if any is missing):
`DB_PASSWORD`, `EMAIL_DB_PASSWORD`, `RABBITMQ_PASSWORD`, `JWT_SECRET`,
`EMAIL_SERVICE_TOKEN`, `AI_SERVICE_TOKEN`, `APP_BASE_URL`, `FRONTEND_ORIGIN`.

Two more are required in practice, and fail at **boot** rather than at
`compose config` — both services set `NODE_ENV=production` here and validate
themselves on start:

- **`EMAIL_PROVIDER` must not be `noop`.** The email service exits rather than
  pretend to deliver reviewer invitations. Set `smtp` and fill `SMTP_HOST`,
  `EMAIL_FROM` and credentials.
- **`AUTH_COOKIE_SECURE` must be `true`,** which means `APP_BASE_URL` must be
  `https://`. A browser silently discards a `Secure` cookie sent over plain
  HTTP, so an HTTP deployment logs users in and then treats every subsequent
  request as anonymous.

**Terminate TLS before letting anyone in.** Compose ships no terminator. Put a
reverse proxy in front of the frontend, point `APP_BASE_URL` and
`FRONTEND_ORIGIN` at it, and keep the container ports on loopback (the default).

> If a container restarts in a loop, read its logs first:
> `docker compose logs backend | tail -20`. Both Node services print
> `Configuration invalid: <what is wrong>` and exit — they are not crashing,
> they are refusing an unsafe configuration.

Validate before starting anything:

```bash
docker compose config --quiet && echo "configuration OK"
```

### Boot order

Compose encodes the real dependencies rather than sleeping:

```
postgres (healthy) ───────┬──> backend ──> frontend
rabbitmq (healthy) ───────┤
postgres-email (healthy) ─┴──> email-service
```

Both application services own their schema at startup: the API applies pending TypeORM
migrations unless `DB_MIGRATE_ON_START=false`, and email-service creates the `email` schema and
runs its migrations in `main.ts` — exiting non-zero if either fails, so a broken migration
surfaces as a failed container rather than a half-migrated database.

### Published ports

All three are bound to `127.0.0.1` by default, so only the reverse proxy on the
same host can reach them. Override in `.env` (e.g. `FRONTEND_HTTP_PORT=0.0.0.0:5240`)
only when the proxy runs on another machine.

| Port | Service | Notes |
|------|---------|-------|
| `127.0.0.1:5240` | frontend | The only port a browser needs — put the proxy here |
| `127.0.0.1:5243` | backend | Debugging only. The browser reaches the API through the frontend's server-side rewrite, which is what keeps the access token out of JavaScript; publishing this publicly routes around that. Drop the mapping once the stack is up |
| `127.0.0.1:15672` | RabbitMQ management UI | Can drain and replay the mail queue. Never expose it — reach it over an SSH tunnel |

PostgreSQL, AMQP, the email worker and ai-service are **not** published. Reach them through the
compose network:

```bash
docker compose exec postgres psql -U postgres folio_review
docker compose exec backend node -e "console.log(process.env.NODE_ENV)"
```

### Optional components

```bash
docker compose --profile grammar up -d    # LanguageTool  (LANGUAGE_TOOL_ENABLED=true)
docker compose --profile search  up -d    # Typesense     (TYPESENSE_ENABLED=true)
```

The profile starts the container; the env flag tells the API to use it. Both are needed.

---

## 3. Operations

### Health

| Service | Probe | Container healthcheck |
|---------|-------|----------------------|
| backend | `GET /api/v1/health` | yes (40 s start period) |
| frontend | `GET /en` | yes |
| email-service | `GET /health`, `GET /ready` (port 5244, internal) | yes |
| ai-service | `GET /health`, `GET /ready`, `GET /v1/status` (port 5245, internal) | yes |

```bash
docker compose ps                     # STATUS column shows (healthy)
docker compose logs -f backend
```

### Migrations

Automatic on boot for both services. To take ownership in a release pipeline, disable the API's
boot-time run and apply migrations as an explicit step:

```bash
# .env
DB_MIGRATE_ON_START=false
```

```bash
docker compose run --rm backend       npm run migrate:prod
docker compose run --rm email-service npm run migrate:prod
```

Both resolve compiled migrations from `dist/db/migrations`. email-service always runs its own
migrations at startup as well, so the explicit step there is a pre-flight check rather than a
substitute.

### Seeding

Seeds are development fixtures and are **not** in the production images (they need `ts-node`).
Seed a demo environment from a checkout instead — see [`DEVELOPMENT.md`](./DEVELOPMENT.md).

`seed.ts` also refuses to run against anything that does not look like a local
machine — it checks `NODE_ENV`, `AUTH_COOKIE_SECURE`, `APP_BASE_URL` and
`DB_HOST` before opening a connection, and the destructive modes
(`SEED_RESET_ALL`, `SEED_RESET_SAMPLE`) additionally require
`FOLIO_ALLOW_DESTRUCTIVE_SEED=1`. This matters because a checkout on an
operator's laptop is one edited `.env` away from the production database, and
`SEED_RESET_ALL` truncates every table and clears `uploads/`.

### Backup and restore

Editorial data, email data and manuscript files are three separate concerns:

```bash
# Databases
docker compose exec -T postgres       pg_dump -U postgres folio_review > folio_review.sql
docker compose exec -T postgres-email pg_dump -U postgres folio_email  > folio_email.sql

# Manuscript files (named volume `folio_uploads`)
docker run --rm -v folio_uploads:/data -v "$PWD:/backup" busybox \
  tar czf /backup/uploads.tar.gz -C /data .
```

Restore is the same in reverse (`psql < dump.sql`, `tar xzf` into the volume). A database
restore without the matching `uploads` archive produces submissions whose files 404 — always
take both at the same point in time.

### Upgrades

```bash
git pull
docker compose build
docker compose up -d          # recreates only changed services
```

Migrations run on the new backend container before it reports healthy. Roll back by checking
out the previous tag and rebuilding; **note that TypeORM migrations are not automatically
reversible** — verify `migration:revert` coverage before relying on a rollback.

### Corpus and AI maintenance

Importers ship inside the ai-service image:

```bash
docker compose run --rm ai-service python scripts/import_oai_pmh.py --help
docker compose run --rm ai-service python scripts/import_back_catalog.py --help
```

`import_back_catalog.py` hardcodes `BACK_CATALOG` + `license="journal-owned"` and stores full
text. Other institutions' articles must be imported as `external_oa` (fingerprint-only)
instead — see [`ARCHITECTURE.md`](./ARCHITECTURE.md#6-data-ownership).

Model downloads persist in the `ai-model-cache` volume (`HF_HOME`), so replacing the container
does not re-download weights.

---

## 4. Production hardening checklist

Configuration:

- [ ] Unique random values for `JWT_SECRET`, `EMAIL_SERVICE_TOKEN`, `AI_SERVICE_TOKEN`, and all three passwords
- [ ] `APP_BASE_URL` and `FRONTEND_ORIGIN` on `https://`, no trailing slash
- [ ] `AUTH_COOKIE_SECURE=true`
- [ ] `AUTH_RETURN_BEARER=false` — bearer responses skip CSRF; test-only
- [ ] `SWAGGER_ENABLED=false`
- [ ] `LOG_FORMAT=json`, `LOG_LEVEL=info`
- [ ] Image tags pinned in `.env` (`POSTGRES_IMAGE_TAG`, `RABBITMQ_IMAGE_TAG`, `LANGUAGETOOL_IMAGE_TAG`, …) — `latest` is not a deployment

- [ ] `EMAIL_PROVIDER=smtp` with the `SMTP_*` block filled, and **one real message sent and received**

Exposure:

- [ ] TLS terminated by a reverse proxy in front of `frontend`
- [ ] Backend port unpublished (or firewalled) when the proxy reaches it over the compose network
- [ ] RabbitMQ management UI removed or restricted
- [ ] Databases unpublished (default)
- [ ] `OPS_METRICS_TOKEN` set, so `/health/outbox` and `/health/ai-jobs` stop reporting queue depth to anonymous callers

Data:

- [ ] `uploads`, `postgres-data`, `postgres-email-data` on durable storage
- [ ] Scheduled dumps of both databases plus the uploads volume, restore rehearsed
- [ ] `AUDIT_RETENTION_DAYS` set to the retention policy you can defend

The backend enforces some of this itself: it refuses to start with example or weak secrets when
the environment looks deployed (HTTPS base URL, remote database, secure cookies). Set
`RUNTIME_CONFIG_STRICT=true` to force those checks in an environment that looks local.

---

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `npm ci` fails on `@folio/shared` during build | Built with a service directory as context | Build from the repository root with `-f <service>/Dockerfile` |
| `docker compose config` errors on a variable | A required secret is unset in `.env` | Fill the REQUIRED block in `docker/.env.example` |
| ai-service exits at startup | Non-loopback `GRPC_BIND_HOST` without `AI_SERVICE_TOKEN` | Set `AI_SERVICE_TOKEN` — this refusal is intentional |
| backend healthy, AI features report unavailable | Only one of the two flags is on | `AI_*_ENABLED` on the API **and** the ai-service flag must both be true |
| Similarity/reviewer matching unavailable although flags are on | Image built without the `similarity` extra | Rebuild with `AI_PIP_EXTRAS=corpus,similarity` |
| Equation rendering fails | Default image has no browser | Keep `EQUATION_RENDER_MATHJAX_ONLY=1`, or rebuild with `BACKEND_WITH_CHROMIUM=true` and set it to `0` |
| email-service exits immediately | Its startup migration failed | `docker compose logs email-service` — the message is `migration run failed: …` |
| No mail arrives, no errors | `EMAIL_PROVIDER=noop` (the default) logs instead of sending | Set `EMAIL_PROVIDER=smtp` and the `SMTP_*` block |
| Port already allocated | Another compose file is running | Only one compose file at a time — see [`DEVELOPMENT.md`](./DEVELOPMENT.md) |

Deeper email diagnostics (queue depth, DLQ, replay):
[`testing-email-pipeline.md`](./testing-email-pipeline.md).
