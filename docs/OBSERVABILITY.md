# Observability — structured logging and distributed tracing

Folio services emit **JSON structured logs** (production) with correlated **trace** and **request** identifiers. Traces export via **OpenTelemetry OTLP** when configured.

## Correlation model

| Field | Header / source | Purpose |
|-------|-----------------|--------|
| `trace_id`, `span_id` | W3C `traceparent` (HTTP, gRPC metadata, RabbitMQ headers) | Machine correlation across services |
| `request_id` | `X-Request-Id` (UUID v4 only) | Human-friendly ID for support tickets and API error bodies |

Invalid client `X-Request-Id` values are **rejected and replaced** with a newly generated UUID v4 (prevents log injection).

## Log schema

Every log line uses these field names (see [`packages/shared/observability/log-fields.ts`](../packages/shared/observability/log-fields.ts)):

| Field | Required | Description |
|-------|----------|-------------|
| `time` | yes | ISO-8601 timestamp |
| `level` | yes | `debug`, `info`, `warn`, `error` |
| `service` | yes | `folio-backend`, `folio-email-service`, `folio-ai-service` |
| `msg` | yes | Human-readable message |
| `trace_id` | when in span | 32-char hex trace ID |
| `span_id` | when in span | 16-char hex span ID |
| `request_id` | when known | UUID v4 |
| `context` | optional | Logger context (class/module) |
| `err` | optional | Structured error (`type`, `message`, `stack`) — **stacks are logged in production**; they are not returned in HTTP JSON bodies |

Conformance fixture: [`packages/shared/observability/log-schema.fixture.json`](../packages/shared/observability/log-schema.fixture.json)

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_SERVICE_NAME` | per-service | Resource attribute `service.name` |
| `OTEL_TRACES_EXPORTER` | `none` | **Authoritative** trace export switch: `none` or `otlp` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | empty | Required when `OTEL_TRACES_EXPORTER=otlp` (e.g. `http://collector:4318/v1/traces`) |
| `OTEL_TRACES_SAMPLER` | SDK default | e.g. `parentbased_traceidratio` |
| `OTEL_TRACES_SAMPLER_ARG` | — | Ratio when using `traceidratio` / `parentbased_traceidratio` |
| `LOG_LEVEL` | `info` | Application log level |
| `LOG_FORMAT` | `pretty` (dev) / `json` (prod) | `pretty` or `json` |

**Precedence:** Trace export is enabled only when `OTEL_TRACES_EXPORTER=otlp` **and** `OTEL_EXPORTER_OTLP_ENDPOINT` is non-empty. Any other combination disables export (with a startup warning).

## Propagation paths

```
Browser → backend (HTTP)
backend → ai-service (gRPC metadata: traceparent, x-request-id)
backend → RabbitMQ → email-service / ai-jobs consumer (AMQP headers, manual inject/extract)
```

RabbitMQ uses **manual** W3C inject/extract in the shared RabbitMQ wrappers — not amqplib auto-instrumentation (deterministic with our channel lifecycle).

AMQP consumers run handlers inside `context.with(...)` so log mixins receive `trace_id` inside async handlers.

## Known limitations

- **Outbox drainer** starts a root `outbox.drain` span. Rows published from an HTTP request are not linked back via span links — the async path is intentionally orphaned from the original HTTP trace. Use `jobId` / `idempotencyKey` in event payloads for business correlation.
- **WebSocket** (constructor collab) does not yet propagate trace context.
- **Frontend** sends `X-Request-Id` on authenticated API calls; public fetches may omit it (backend generates one).

## Local development

```env
OTEL_TRACES_EXPORTER=none
LOG_FORMAT=pretty
LOG_LEVEL=info
```

No collector required. Traces stay in-process for log correlation; export is off.

## Services

| Service | Package / module |
|---------|------------------|
| backend, email-service | `@folio/nest-observability` + `nestjs-pino` |
| ai-service | `app/observability/` + `structlog` |
| Shared headers / AMQP helpers | `@folio/shared/observability` |
