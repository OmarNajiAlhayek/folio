## @folio/shared (canonical messaging contracts)

Shared TypeScript used by the Nest **backend** (publisher) and **email-service** (consumer).

| Path | Role |
|------|------|
| `contracts/` | Event payload types and routing keys (no runtime) |
| `messaging/topology.ts` | RabbitMQ exchange / queue / binding asserts |
| `messaging/idempotency.ts` | Idempotency key builders (must match on both sides) |
| `messaging/redactor.ts` | PII stripping for logs and DLQ inspection |

### Editing workflow

1. Change files **only** under `packages/shared/`.
2. From the **repo root**, run:

   ```bash
   npm run sync:shared
   ```

   That copies each canonical file byte-for-byte into:

   - `backend/src/messaging/contracts/` and `backend/src/messaging/shared/`
   - `services/email-service/src/contracts/` and `services/email-service/src/shared/`

3. Commit canonical + mirrors together.

### CI / pre-merge check

```bash
npm run check:shared
```

Exits non-zero if any mirror differs from `packages/shared`. No separate build step.

### Why mirrors exist

Each Nest app compiles with `rootDir` under its own `src/`. Mirrors avoid pulling `../../packages/shared` into `tsc` output layout. Long term, a workspace package (`@folio/shared`) can replace copies; until then, **sync + check** prevents drift.

Email design: [`docs/plans/email-service.md`](../../docs/plans/email-service.md) (canonical). Optional walkthrough: [`email-details.md`](../../email-details.md) at repo root.
