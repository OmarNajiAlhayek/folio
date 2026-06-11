# Performance and load testing

Repeatable benchmarks for concurrent review submissions, email pipeline throughput, and AI service latency. These are **regression baselines** for the local/noop stack — not production SLOs.

## What is covered

| Suite | Tool | Entry points |
|-------|------|----------------|
| Concurrent review submissions | k6 | `POST /api/v1/assignments/:slug/reviews` |
| Email pipeline throughput | k6 | `POST /api/v1/submissions/:slug/assignments` → outbox → email-service |
| AI gRPC latency | Python | `ClassifyArticle`, `SuggestKeywords`, `FindSimilarArticles` on gRPC :5246 |
| Corpus similarity jobs | Python + HTTP | `POST …/corpus-similarity/jobs` → poll job status |

Harness lives in [`perf/`](../perf/). Operator guide: [`perf/README.md`](../perf/README.md).

## Local run

1. Start the full stack:

   ```bash
   docker compose -f docker-compose.local.yml up -d
   ```

2. Ensure backend has `AUTH_RETURN_BEARER=true` and elevated throttle limits (see [`perf/README.md`](../perf/README.md)).

3. Seed perf fixtures and run:

   ```bash
   cd backend && npm run seed:perf
   cd .. && npm run test:perf
   ```

Reports: `perf/reports/*.json`

## CI

Workflow [`.github/workflows/perf.yml`](../.github/workflows/perf.yml):

- **Manual:** Actions → Performance → Run workflow
- **Scheduled:** Sundays 02:00 UTC

The job starts `docker-compose.local.yml`, seeds perf fixtures, runs `node perf/run.mjs --ci`, and uploads `perf/reports/` as an artifact. Failures mean a threshold in [`perf/thresholds.json`](../perf/thresholds.json) was breached.

PR CI does **not** run perf tests (too slow; needs full stack).

## Observability during runs

| Endpoint | Use |
|----------|-----|
| `GET /api/v1/health/outbox` | Outbox backlog (`pending`, `dead`, `dueNow`) |
| `GET /api/v1/health/ai-jobs` | `ai_jobs` counts by status and type |
| `GET /api/v1/admin/email/pipeline-status` | Outbox + email_log + RabbitMQ queue depths (JWT + `email.manage_reminders`) |
| RabbitMQ management `:15672` | Queue publish/deliver rates |

AI queues `ai.similarity_index` and `ai.corpus_similarity` are included in pipeline-status RabbitMQ metrics.

## Tuning thresholds

Edit [`perf/thresholds.json`](../perf/thresholds.json). Re-run locally before loosening CI gates.

Fixture counts (seed):

```bash
SEED_PERF_REVIEW_COUNT=20 SEED_PERF_EMAIL_COUNT=50 npm run seed:perf
```

## Related docs

- Email pipeline correctness: [`testing-email-pipeline.md`](testing-email-pipeline.md)
- Opt-in broker integration: `npm run test:pipeline`, `npm run test:ai-jobs`
