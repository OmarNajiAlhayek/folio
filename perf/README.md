# Folio performance harness

Repeatable load benchmarks for:

- **Concurrent review submissions** (`k6/review-submit.k6.js`)
- **Email pipeline throughput** (`k6/email-pipeline.k6.js`)
- **AI service gRPC latency** (`services/ai-service/scripts/ai_grpc_bench.py`)

## Prerequisites

1. Full stack running (recommended):

   ```bash
   docker compose -f docker-compose.local.yml up -d
   ```

2. Backend env for perf:

   ```
   AUTH_RETURN_BEARER=true
   THROTTLE_DEFAULT_LIMIT=10000
   THROTTLE_LOGIN_LIMIT=10000
   ```

3. [k6](https://k6.io/docs/get-started/installation/) on your PATH.

4. Perf fixtures in the database:

   ```bash
   cd backend && npm run seed:perf
   ```

## Quick start

From repo root:

```bash
npm run test:perf:setup   # login accounts → perf/.env.json
npm run test:perf         # run all suites
```

Options:

```bash
node perf/run.mjs --only review-submit
node perf/run.mjs --only email-pipeline
node perf/run.mjs --only ai-grpc
node perf/run.mjs --ci    # strict thresholds (CI / regression gate)
```

Reports land in `perf/reports/`.

## Fixture tuning

| Env | Default | Purpose |
|-----|---------|---------|
| `SEED_PERF_REVIEW_COUNT` | 20 | Accepted assignments for review-submit bench |
| `SEED_PERF_EMAIL_COUNT` | 50 | Submissions for email-pipeline burst |
| `PERF_VUS` | fixture count | k6 virtual users (review-submit) |
| `PERF_EMAIL_INVITES` | fixture count | Invites per email-pipeline run |

## Thresholds

Baselines for noop/local stack live in [`thresholds.json`](thresholds.json). They are regression gates, not production SLOs.

See [`docs/testing-performance.md`](../docs/testing-performance.md) for CI workflow and observability endpoints.
