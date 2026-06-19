# Service level objectives (production)

Production SLOs are **separate** from local regression thresholds in [`perf/thresholds.json`](../perf/thresholds.json). Perf CI gates catch regressions on the noop/local stack; SLOs define what operators target in deployed environments.

## Tiers

| Tier | Scope | Availability | API p95 | Async / search |
|------|-------|--------------|---------|----------------|
| Critical | Auth, submit, review write | 99.9% | 500 ms | — |
| Standard | Lists, detail, notifications | 99.5% | 1 s | — |
| Async | Email outbox, AI jobs | — | — | Outbox age ≤ 5 min |
| Search | Public catalog, Typesense | — | — | Search p95 ≤ 2 s |

## Measurement

| Signal | Source |
|--------|--------|
| HTTP latency | Ingress / APM (OTLP traces with `http` + `pg` spans) |
| Error rate | Structured logs + trace error status |
| Outbox backlog | `GET /api/v1/health/outbox`, pipeline-status |
| AI job backlog | `GET /api/v1/health/ai-jobs` |
| DB query time | `pg_stat_statements`, OTEL `db.statement` child spans |
| Search | Typesense metrics or `perf/scripts/typesense-bench.mjs` |

## Alerting (future)

Map SLO burn rates to Grafana/Datadog when `OTEL_TRACES_EXPORTER=otlp` points at a collector. Until then, use weekly [`perf.yml`](../.github/workflows/perf.yml) artifacts and manual pipeline-status checks.

## Out of scope (documented)

- Frontend Web Vitals / SSR (optional: Lighthouse CI, Playwright performance API)
- MinIO upload bandwidth (file-upload k6 measures API accept latency only)
- WebSocket constructor collab (no trace propagation yet — see [`OBSERVABILITY.md`](./OBSERVABILITY.md))
- pgvector HNSW at high embedding volume (partially covered by ai-grpc bench)

## Related

- Local perf runbook: [`testing-performance.md`](./testing-performance.md)
- Observability: [`OBSERVABILITY.md`](./OBSERVABILITY.md)
- Query budgets: [`perf/query-budgets.json`](../perf/query-budgets.json)
