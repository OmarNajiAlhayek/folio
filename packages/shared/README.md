## @folio/shared

Canonical TypeScript contracts and messaging helpers for the Nest **backend** (publisher) and **email-service** (consumer).

| Path | Role |
|------|------|
| `contracts/` | Event payload types and routing keys |
| `messaging/topology.ts` | RabbitMQ exchange / queue / binding asserts |
| `messaging/idempotency.ts` | Idempotency key builders (must match on both sides) |
| `messaging/redactor.ts` | PII stripping for logs and DLQ inspection |
| `email/register-folio-email-partials.ts` | Shared Handlebars email layout partials |
| `ids/entity-id.ts` | UUID v7 generator for database primary keys and cross-service entity references |

### Entity ID contract

All database primary keys and entity references in RabbitMQ event payloads use **UUID v7** (time-ordered, RFC 4122). Generate them with:

```ts
import { generateEntityId } from '@folio/shared';
```

**Request correlation IDs** (`x-request-id`) remain **UUID v4** — see `observability/request-id.ts`.

### Editing workflow

1. Change files **only** under `packages/shared/`.
2. Rebuild the package (runs automatically on `npm install` via `prepare`):

   ```bash
   npm run build:shared   # from repo root
   ```

3. Both Nest apps depend on `@folio/shared` through a `file:` workspace link — no mirror copies.

### Consumers

- `backend/package.json` → `"@folio/shared": "file:../packages/shared"`
- `services/email-service/package.json` → `"@folio/shared": "file:../../packages/shared"`

Import examples:

```ts
import { ROUTING_KEY } from '@folio/shared/contracts/email-events';
import { reviewerInvitedKey } from '@folio/shared/messaging/idempotency';
import { DEFAULT_TOPOLOGY } from '@folio/shared/messaging/topology';
import { generateEntityId } from '@folio/shared';
```

Email design: [`docs/plans/email-service.md`](../../docs/plans/email-service.md).
