# Testing the email pipeline

This supplements the automated tests in the repo. For architecture and behavior, prefer [`plans/email-service.md`](plans/email-service.md). The repo root file [`email-details.md`](../email-details.md) is an informal narrative walkthrough (may drift—resolve discrepancies against code + `email-service` plan).

## What runs in CI / locally without extra services

RabbitMQ is **not** required for these commands: unit tests mock RabbitMQ and DB where needed. Postgres **is** required for **`backend` e2e** because `AppModule` boots TypeORM against a real database.

| Command | What it covers |
|--------|----------------|
| `cd services/email-service && npm test` | Handlers, templates, idempotency, redactor, reminder scheduler (mocked RabbitMQ / DB). |
| `cd backend && npm test` | Outbox drainer, event publisher enqueue, `SubmissionsService.assignReviewer` outbox contract (mocked DB), **`RemindersService`** (mocked `DataSource`; no `email` schema required), **pipeline observability** (mocked repositories + queue metrics). |
| `cd backend && npm run test:e2e` | HTTP app + database: `GET /api/v1/health` and `GET /api/v1/health/outbox`; [`admin-email.e2e-spec.ts`](../backend/test/admin-email.e2e-spec.ts) (401/403/422 always; policy/template/preview/**pipeline-status**/409 when schema **`email`** and seed rows exist — otherwise DB-backed `it` blocks no-op with a console warning). Needs the same **`DB_*`** vars as `backend/.env`. Apply [`grant-email-reminder-admin.sql`](../backend/scripts/grant-email-reminder-admin.sql) if the backend DB user cannot read/update `email.*` (includes **`SELECT` on `email.email_log`** for pipeline status). |

## Journal email admin API (templates & policy)

Editors with JWT + **`email.manage_reminders`** can manage the singleton reminder policy and all five transactional templates (`reviewer-invited`, `reminder-due`, and the three `copyedit-*` keys — unknown keys return **422**):

| Method | Path |
|--------|------|
| `GET` | `/api/v1/admin/email/reminder-policy` |
| `PATCH` | `/api/v1/admin/email/reminder-policy` — body `{ "reviewDueInDays": number (≥4), "expectedUpdatedAt": ISO }`; mismatch → **409** |
| `GET` | `/api/v1/admin/email/templates/reviewer-invited` |
| `GET` | `/api/v1/admin/email/templates/reminder-due` |
| `GET` | `/api/v1/admin/email/templates/copyedit-assigned` (and `copyedit-queries-sent`, `copyedit-author-ready`) |
| `GET` | `/api/v1/admin/email/templates/submission-submitted`, `submission-decision` |
| `PATCH` | `/api/v1/admin/email/templates/:templateKey` — full template fields + `expectedUpdatedAt`; mismatch → **409** |
| `POST` | `/api/v1/admin/email/templates/:templateKey/preview` — optional `{ "isOverdue": true }` for reminder-due branch; **does not send mail** |
| `GET` | `/api/v1/admin/email/pipeline-status` — outbox + `email_log` + `email.reminder` + cached RabbitMQ queue depths (redacted samples; requires **`SELECT` on `email.email_log`**) |

**DB:** tables live in schema **`email`** (same database as backend). Run email-service migrations first. Apply [`grant-email-reminder-admin.sql`](../backend/scripts/grant-email-reminder-admin.sql) if the backend DB role cannot read/update `email.*`.

**UI:** Folio frontend — **`/editor/email-settings`** (nav link when the permission is present).

**UI (Playwright, opt-in):** from `frontend/`, set `E2E_EMAIL_ADMIN_UI=1` and run `npm run test:e2e` to execute [`email-admin.spec.ts`](../frontend/e2e/email-admin.spec.ts) (logs in as `editor@folio.local` / `Editor123!` unless `E2E_EDITOR_EMAIL` / `E2E_EDITOR_PASSWORD` override). Requires a seeded editor and running frontend + backend (see Playwright `webServer` config).

## Reminder admin API (per assignment)

Editors with JWT + permission **`email.manage_reminders`** can list, read, reschedule (`PATCH` `sendAt`), or cancel pending rows in **`email.reminder`** for a known assignment:

- `GET /api/v1/submissions/:submissionSlug/assignments/:assignmentSlug/reminders`
- `GET /api/v1/submissions/:submissionSlug/assignments/:assignmentSlug/reminders/:reminderId`
- `PATCH /api/v1/submissions/:submissionSlug/assignments/:assignmentSlug/reminders/:reminderId` (body `{ "sendAt": "<ISO-8601>" }` — must be **> now + 2 minutes** or the API returns **422**)
- `POST /api/v1/submissions/:submissionSlug/assignments/:assignmentSlug/reminders/:reminderId/cancel`

**DB:** run email-service migrations so schema `email` exists, then apply [`backend/scripts/grant-email-reminder-admin.sql`](../backend/scripts/grant-email-reminder-admin.sql) (edit the `TO` role if `DB_USERNAME` is not `postgres`). Without `USAGE`/`SELECT`/`UPDATE`, list/patch/cancel will fail at query time.

**Races:** rescheduling does not dequeue an already-published `reminder.due` Rabbit message; **cancel** plus the email-service **re-fetch before `provider.send`** prevents a send after cancel. PATCH returns **422** when the row is not `pending` or `sendAt` is too soon.

## Full stack (manual / staging)

For an end-to-end check with real RabbitMQ, Postgres, backend, and email-service:

1. **RabbitMQ** — e.g. `docker compose -f docker-compose.dev.yml up -d` (AMQP **`5672`**). Management UI: **`http://localhost:15672`** (default login **`guest` / `guest`** — change in production). Use it to confirm exchanges, queues (`email.reviewer_invited`, `email.reminder_due`), and message flow.
2. **Postgres** — same database name for backend and email-service; backend uses `public`, email-service uses schema `email` (migrations run on email-service startup).
3. **Env** — set `RABBITMQ_URL`, `DB_*`, `APP_BASE_URL`, and for email-service `EMAIL_PROVIDER=noop` (or SMTP) and `DB_SCHEMA=email` per `backend/.env.example` and `services/email-service/.env.example`.
4. **Processes** — start **RabbitMQ first**, then the Nest backend, then the email-service worker (no HTTP port on the worker). If RabbitMQ is down, **already-committed** outbox rows stay `pending` until the drainer can publish; the HTTP `POST …/assignments` path still needs Postgres to commit **both** the assignment and the outbox row together — a DB/outbox failure returns an error and **no** assignment is stored.
5. **Trigger** — `POST /api/v1/submissions/:slug/assignments` with a valid editor JWT and `reviewerId`. On **2xx**, treat the assignment as created (outbox row committed in the same transaction). On **non-2xx**, the assignment was not created; retries are safe because duplicate active assignments return **400**. Confirm:
   - **`public.outbound_event_outbox`**: new row with `routing_key = 'reviewer.invited'`, then `status` moves to `published` after the drainer runs (≤ ~10s).
   - **RabbitMQ**: message leaves `email.reviewer_invited` after the consumer acks.
   - **`email.email_log`** / **`email.reminder`**: rows appear after the worker processes the event (`EMAIL_PROVIDER=noop` logs a would-be send instead of SMTP).

   Example checks in `psql` (adjust database name):

   ```sql
   SELECT id, routing_key, status, attempts, created_at
   FROM public.outbound_event_outbox
   ORDER BY created_at DESC LIMIT 5;

   SELECT id, idempotency_key, status, template, created_at
   FROM email.email_log
   ORDER BY created_at DESC LIMIT 5;

   SELECT id, assignment_slug, kind, status, send_at
   FROM email.reminder
   ORDER BY created_at DESC LIMIT 5;
   ```

## Orphan assignments (historical / manual repair)

The transactional outbox fixes the **forward** path: new assignments always
have a matching `outbound_event_outbox` row after a successful `POST …/assignments`.
Older environments may still have assignments without a pending/published
`reviewer.invited` row (e.g. from a previous bug or manual DB edits).

Example: list recent assignments and whether an outbox row exists for the
expected idempotency key pattern (`reviewer_invited:<assignment_slug>` is
the email-service idempotency key; the outbox stores the JSON payload, not
that string as a column — use `routing_key = 'reviewer.invited'` and
inspect `payload->>'assignmentSlug'` or correlate by time):

```sql
SELECT ra.slug AS assignment_slug, ra.created_at
FROM public.review_assignments ra
WHERE ra.status = 'invited'
ORDER BY ra.created_at DESC
LIMIT 20;

SELECT id, routing_key, status, attempts, created_at
FROM public.outbound_event_outbox
WHERE routing_key = 'reviewer.invited'
ORDER BY created_at DESC
LIMIT 20;
```

**Repair:** there is no automatic backfill. Operators must **insert** a
correct outbox row (or re-run assignment through the API after cleaning
orphan rows) consistent with app payload shape, or **manually** publish to
RabbitMQ in staging — follow [`plans/email-service.md`](plans/email-service.md)
event contract.

There is no single npm script that boots Docker, both apps, and asserts on queues automatically; add Testcontainers or a compose profile in CI when you want that fully automated.

## Operator runbooks (pipeline visibility)

**Where to look**

- **Public probe:** `GET /api/v1/health/outbox` — pending / published / dead counts (no payloads).
- **Authenticated snapshot:** `GET /api/v1/admin/email/pipeline-status` (JWT + `email.manage_reminders`) — outbox + `email.email_log` + `email.reminder` + **cached** RabbitMQ queue depths. Apply [`grant-email-reminder-admin.sql`](../backend/scripts/grant-email-reminder-admin.sql) so the backend role has **`SELECT` on `email.email_log`** (and existing `email.*` grants).

**Growing `pending` outbox or high `dueNow`**

- Check RabbitMQ is up and reachable from the API (`RABBITMQ_URL`). Fix networking or credentials, then let the outbox drainer publish; pending rows should drain.
- Inspect backend logs for `outbox.retry` / `outbox.dead`.

**`dead` outbox rows**

- Meaning: the drainer exceeded its retry cap talking to the broker. Inspect `last_error` in Postgres (`public.outbound_event_outbox`). After fixing the root cause, recovery is **manual** (re-insert a correct row or republish with care — there is no “magic requeue” API in v1).

**`email.email_log` status `failed` and DLQ depth**

- A failed provider send marks the log row `failed` and the message was **nack’d without requeue**, so it lands on the dead-letter path (`folio.events.dlq` in the default topology). Fix SMTP/provider or template issues first.
- Use the RabbitMQ management UI (see “Full stack” above) to inspect DLQ messages.

**Idempotency before republishing from the DLQ**

- Republishing `reviewer.invited` or `reminder.due` is **not always safe**. The email-service uses **`email_log` idempotency keys** and transactional pre-claims (see [`plans/email-service.md`](plans/email-service.md) §6). A first attempt may have **committed reminder rows or `email_log`** before the SMTP failure; blindly republishing can **duplicate side effects** (e.g. extra reminders) even if a second send is deduped. Before moving messages out of the DLQ: correlate **`idempotency_key`**, `email.email_log`, and assignment/submission state in Postgres; when in doubt, fix forward and avoid replay.

**Reminder rows stuck `pending`**

- `pending` with **`send_at` in the future** is normal. If `send_at` is far in the past and rows stay `pending`, check **email-service** (scheduler/cron) and that the worker consumes `reminder.due`.

## Journal email admin — manual smoke (checklist)

Use this for a release or staging sign-off (copy into a PR if you prefer not to version it here):

1. Run **email-service** migrations so schema `email` exists, including policy + template tables/rows (e.g. migration `1714600000001-email-templates-and-policy.ts` in `services/email-service`).
2. If the backend DB user is not a superuser, apply [`grant-email-reminder-admin.sql`](../backend/scripts/grant-email-reminder-admin.sql) (adjust `TO` to match `DB_USERNAME`).
3. **App RBAC:** log in as a user with **Editor** (or any role with `email.manage_reminders`). Confirm the nav link and **`/[locale]/editor/email-settings`** load policy and both templates without error.
4. **Optimistic lock:** open two tabs, change reminder policy in both, save the stale tab second → expect **409** (`EMAIL_POLICY_CONFLICT` / refresh message).
5. **Preview:** use **POST** `…/preview` (or the UI preview buttons) for `reminder-due` with and without overdue; response is rendered HTML/text only (no mail).
6. **Submission reminders:** as the same editor, open a submission with assignments; confirm the per-assignment reminder table and reschedule/cancel actions hit `/api/v1/submissions/.../reminders` as expected (network tab or backend logs).
7. **Pipeline status:** on **Email settings**, confirm the pipeline card loads (or shows a clear DB/permission error). With RabbitMQ down, DB sections should still populate; broker line should show unavailable.

## One-liner (bash) for all automated tests in this doc

From the repository root:

```bash
(cd backend && npm test && npm run test:e2e) && (cd services/email-service && npm test)
```

PowerShell (from repository root):

```powershell
Set-Location backend; npm test; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run test:e2e; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Set-Location ../services/email-service; npm test
```

After this script, the shell’s current directory is `services/email-service`. Run `Set-Location ../..` to return to the repo root.
