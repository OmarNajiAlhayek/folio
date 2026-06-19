# Folio performance harness

Repeatable load benchmarks. Full runbook: [`docs/testing-performance.md`](../docs/testing-performance.md).

## Suites

| Script | Purpose |
|--------|---------|
| `k6/review-submit.k6.js` | Concurrent review submissions |
| `k6/email-pipeline.k6.js` | Email outbox throughput |
| `k6/editor-queue.k6.js` | Editor submission list |
| `k6/reviewer-inbox.k6.js` | Reviewer assignment inbox |
| `k6/auth-login.k6.js` | Login burst (prod throttle) |
| `k6/public-search.k6.js` | Public catalog search |
| `k6/notifications.k6.js` | Notification inbox |
| `k6/submission-detail.k6.js` | Submission detail reads |
| `k6/file-upload.k6.js` | Manuscript upload |
| `k6/audit-stress.k6.js` | Audit write amplification |
| `k6/pool-stress.k6.js` | Connection pool stress (advanced) |
| `k6/soak.k6.js` | Endurance (advanced) |
| `../services/ai-service/scripts/ai_grpc_bench.py` | gRPC latency |
| `scripts/typesense-bench.mjs` | Typesense search (optional) |

## Prerequisites

1. Full stack: `docker compose -f docker-compose.local.yml up -d`
2. Backend: `AUTH_RETURN_BEARER=true`, elevated `THROTTLE_*` limits (`THROTTLE_DEFAULT_LIMIT`, `THROTTLE_PUBLIC_LIMIT`, `THROTTLE_UPLOAD_LIMIT=10000` for file-upload)
3. [k6](https://k6.io/docs/get-started/installation/) on PATH
4. Seed fixtures (see **Seed workflow** below)

## Seed workflow

| Goal | Command |
|------|---------|
| k6 perf fixtures (`[Perf]` published catalog, queue rows) | `cd backend && npm run seed:perf` |
| Integration catalog (`[Demo]` + author `A. Researcher`) | `cd backend && npm run seed` |
| Both | `npm run seed:all` (from repo root) |

`seed:perf` intentionally skips `[Demo]` published titles. Run `npm run seed` first when you need publication-catalog integration tests or demo UI data alongside perf rows.

## Quick start

```bash
npm run test:perf:setup
npm run test:perf
npm run test:perf:ci    # strict thresholds + pg-stat + baseline compare
```

```bash
node perf/run.mjs --only editor-queue
node perf/run.mjs --skip-advanced
node perf/run.mjs --continue-on-failure   # run full matrix; fail at end
```

## Thresholds

Edit [`thresholds.json`](thresholds.json), then:

```bash
node perf/scripts/generate-k6-thresholds.mjs
```

k6 scripts import generated [`k6/lib/thresholds.js`](k6/lib/thresholds.js).

## Fixture tuning

| Env | Default |
|-----|---------|
| `SEED_PERF_REVIEW_COUNT` | 20 |
| `SEED_PERF_EMAIL_COUNT` | 50 |
| `SEED_PERF_QUEUE_COUNT` | 200 |
| `SEED_PERF_PUBLISHED_COUNT` | 100 |

## Reports

- `reports/*.json` — per-suite metrics
- `reports/summary.json` — aggregate pass/fail
- `reports/pg-stat.json` — `pg_stat_statements` snapshot
- `baselines/summary.json` — regression baseline (update intentionally)
