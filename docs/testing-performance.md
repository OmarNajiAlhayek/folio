# Performance and load testing

Repeatable benchmarks for concurrent review submissions, email pipeline throughput, AI service latency, editor/reviewer lists, auth, search, notifications, uploads, and database query budgets. These are **regression baselines** for the local/noop stack — not production SLOs (see [`slo.md`](./slo.md)).

Harness lives in [`perf/`](../perf/). Operator guide: [`perf/README.md`](../perf/README.md).

## Suites

| Suite | Tool | Entry points |
|-------|------|----------------|
| Concurrent review submissions | k6 | `POST /api/v1/assignments/:slug/reviews` |
| Email pipeline throughput | k6 | `POST …/assignments` → outbox → email-service |
| Editor queue | k6 | `GET /api/v1/submissions` |
| Reviewer inbox | k6 | `GET /api/v1/assignments/me` |
| Auth burst | k6 | `POST /api/v1/auth/login` (prod-like throttle) |
| Public catalog search | k6 | `GET /api/v1/public/submissions?q=…` |
| Notifications | k6 | `GET/PATCH /api/v1/notifications` |
| Submission detail | k6 | `GET /api/v1/submissions/:slug` |
| File upload | k6 | `POST /api/v1/submissions/:slug/files` |
| Audit stress | k6 | Mixed authenticated reads (`AUDIT_SAMPLE_RATE=1`) |
| AI gRPC latency | Python | Classify / Keywords / Similarity on :5246 |
| Corpus similarity jobs | Python + HTTP | `POST …/corpus-similarity/jobs` |
| Typesense (optional) | Node | Direct search when `TYPESENSE_ENABLED=true` |
| Pool stress | k6 | `DB_POOL_MAX + 10` VUs mixed read (manual/weekly) |
| Soak | k6 | 30 min low-rate mixed traffic (manual) |

Thresholds: single source of truth in [`perf/thresholds.json`](../perf/thresholds.json) → generated [`perf/k6/lib/thresholds.js`](../perf/k6/lib/thresholds.js).

Query budgets: [`perf/query-budgets.json`](../perf/query-budgets.json) enforced via `pg_stat_statements` snapshot in CI.

## Local run

1. Start the full stack:

   ```bash
   docker compose -f docker-compose.local.yml up -d
   ```

2. Backend env for perf:

   ```
   AUTH_RETURN_BEARER=true
   THROTTLE_DEFAULT_LIMIT=10000
   THROTTLE_PUBLIC_LIMIT=10000
   THROTTLE_LOGIN_LIMIT=10000
   THROTTLE_UPLOAD_LIMIT=10000
   TYPEORM_MAX_QUERY_EXECUTION_TIME_MS=100
   ```

3. Seed fixtures and run:

   ```bash
   npm run seed:all          # demo + perf rows (or seed:perf alone for k6-only)
   npm run test:perf
   ```

   CI mode:

   ```bash
   npm run test:perf:ci
   ```

   Single suite:

   ```bash
   node perf/run.mjs --only editor-queue
   ```

   Skip long advanced suites (pool-stress, soak):

   ```bash
   node perf/run.mjs --skip-advanced
   node perf/run.mjs --continue-on-failure
   ```

`pg_stat_statements` snapshot runs after HTTP suites. On dev Postgres without the extension preloaded (e.g. `docker-compose.dev.yml` on port 5434), local runs skip the gate automatically; CI uses `docker-compose.local.yml` (port 5432) where the extension is enabled.

Reports: `perf/reports/*.json`, aggregate `perf/reports/summary.json`, DB `perf/reports/pg-stat.json`.

## Fixture tuning

| Env | Default | Purpose |
|-----|---------|---------|
| `SEED_PERF_REVIEW_COUNT` | 20 | Accepted assignments for review-submit |
| `SEED_PERF_EMAIL_COUNT` | 50 | Submissions for email-pipeline burst |
| `SEED_PERF_QUEUE_COUNT` | 200 | Non-draft submissions for editor queue |
| `SEED_PERF_PUBLISHED_COUNT` | 100 | Published rows for catalog search |
| `PERF_VUS` | per suite | k6 virtual users |
| `AUDIT_SAMPLE_RATE` | 1.0 | Audit insert sampling (use 0.25 for transactional-only perf) |

## CI

| Workflow | When | What |
|----------|------|------|
| [`.github/workflows/perf.yml`](../.github/workflows/perf.yml) | Weekly + manual | Full harness, pg-stat, baseline compare |
| [`.github/workflows/perf-smoke.yml`](../.github/workflows/perf-smoke.yml) | PR optional | `review-submit` + `editor-queue` only |

Artifacts: `perf/reports/summary.json`, `pg-stat.json`, per-suite JSON.

### Baseline regression

Committed baseline: [`perf/baselines/summary.json`](../perf/baselines/summary.json).  
`compare-baseline.mjs` fails CI when HTTP p95 drifts more than `thresholds.regression.maxP95DriftPercent` (default 20%). Update the baseline file after intentional improvements.

## Database observability during runs

| Mechanism | Config |
|-----------|--------|
| OTEL `pg` spans | `OTEL_TRACES_EXPORTER=otlp` + collector |
| TypeORM slow query log | `TYPEORM_MAX_QUERY_EXECUTION_TIME_MS` |
| Postgres statement cap | `DB_STATEMENT_TIMEOUT_MS` |
| pg_stat snapshot | `perf/scripts/pg-stat-snapshot.mjs` (auto in `run.mjs`) |

Pool: `DB_POOL_MAX` (default 30), `DB_POOL_IDLE_TIMEOUT_MS`, `DB_POOL_CONNECTION_TIMEOUT_MS`.

### EXPLAIN plan tests (opt-in)

```bash
cd backend
RUN_QUERY_PLAN_TESTS=1 npx jest --config test/jest-query-plans.json
```

## Observability endpoints

| Endpoint | Use |
|----------|-----|
| `GET /api/v1/health/outbox` | Outbox backlog |
| `GET /api/v1/health/ai-jobs` | AI job counts |
| `GET /api/v1/admin/email/pipeline-status` | Outbox + email_log + RabbitMQ |
| RabbitMQ `:15672` | Queue rates |

See also [`OBSERVABILITY.md`](./OBSERVABILITY.md) for trace/log correlation.

## Multi-instance perf

```bash
docker compose -f docker-compose.local.yml -f docker-compose.perf.yml up -d
```

Validates outbox `FOR UPDATE SKIP LOCKED` under two API instances.

## Related docs

- Production SLOs: [`slo.md`](./slo.md)
- Email pipeline correctness: [`testing-email-pipeline.md`](./testing-email-pipeline.md)
- Opt-in integration: `npm run test:pipeline`, `npm run test:ai-jobs`
