## @folio/shared (lightweight, type-only + thin helpers)

Shared TypeScript code used by both the Nest backend (`backend/`) and the
email microservice (`services/email-service/`). Kept intentionally small:

- `contracts/` — pure type definitions for events crossing the RabbitMQ bus.
  No runtime code lives here. Both apps import these to stay in sync.
- `messaging/` — small runtime helpers that must agree on both sides:
  - `topology.ts` — `assertTopology()` declaring the exchange, DLX, queues
    and bindings idempotently on startup. Called by both apps.
  - `redactor.ts` — strips `reviewer` / `invitedBy` blocks from any event
    payload before it goes near a logger or DLQ inspection tool.
  - `idempotency.ts` — pure helpers for building canonical idempotency keys.

This is consumed via TypeScript path mapping in each app's `tsconfig.json`
(no build step, no separate npm package). See `docs/plans/email-service.md`.
