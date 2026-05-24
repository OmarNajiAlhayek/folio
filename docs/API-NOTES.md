# API notes (NestJS, MVP)

High-level REST contract for the NestJS app in `backend/`. Implementation follows this sketch; data and statuses match [`DATA-MODEL.md`](./DATA-MODEL.md) and behaviors [`USER-STORIES.md`](./USER-STORIES.md).

## Conventions

- **Base URL:** `/api/v1` (prefix as you prefer).
- **Content-Type:** `application/json` except file upload routes (`multipart/form-data`).
- **IDs:** UUIDs in path params (e.g. `/submissions/:id`).
- **Errors:** JSON body shaped as:

```json
{
  "message": "Human-readable summary",
  "code": "MACHINE_CODE"
}
```

Use stable `code` values for the frontend (e.g. `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`). Optionally align later with [RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807) Problem Details (`application/problem+json`).

- **Auth:** **JWT** access token in `Authorization: Bearer <token>`. Optional refresh token route in a later iteration. Nest: `JwtAuthGuard` + role guards (`RolesGuard`) checking claims or DB roles.

### Submission `status` in API

Must include `copyediting` between acceptance and publication: `draft`, `submitted`, `under_review`, `revisions_requested`, `accepted`, `rejected`, `copyediting`, `published`. Transitions enforced in service layer, not ad hoc from clients.

### Copyediting

- **Assign:** `POST /submissions/:slug/copyedit-assignments` body `{ copyeditorId }` — submission must be `accepted` or already `copyediting`; duplicate copyeditor per submission rejected; multiple different copyeditors allowed.
- **Queries:** `POST /copyedit-assignments/:assignmentSlug/notes` body `{ noteForAuthor, noteToEditorOnly? }` — assignment `active` or `ready_for_review` → `awaiting_author`; emits `copyedit.queries_sent`.
- **Author ready:** `POST /copyedit-assignments/:assignmentSlug/ready` — author only; requires new `manuscript` upload after latest note; emits `copyedit.author_ready`.
- **Publish:** `POST /submissions/:slug/publish` — copyeditor assigned on submission; all assignments must be `ready_for_review`.
- **List notes:** `GET /submissions/:slug/copyedit-notes` — timeline with `round`, `assignmentSlug`; author sees `noteForAuthor` only.
- **Dev DB:** drop unique on `copyedit_notes.assignment_id` when migrating from one-note schema (TypeORM `synchronize` on fresh DBs applies automatically).

### Peer review policy (OJS-style)

- **`GET /submissions/:slug`** returns a **JSON-shaped submission** that depends on the caller: editors and authors see full metadata (and full file lists); **assigned reviewers** see a **redacted** payload per [`DATA-MODEL.md`](./DATA-MODEL.md) (review method × metadata matrix), **only files with `file_stage = review`**, and never `constructor_content` or `review_assignments`.
- **`GET /assignments/me`** nests the same reviewer-safe submission summary under each assignment.
- **File download:** authenticated reviewers may only fetch files in the **review** stage (except public published artifacts as already defined). Authors and editors may fetch all files they are allowed to see.
- **Gate:** Transition to `under_review` (editor `PATCH .../status`) and the automatic `submitted` → `under_review` step when a reviewer **accepts** require at least one **`manuscript`** file with `file_stage = review`. Error code `REVIEW_PACKAGE_INCOMPLETE` when violated.

### Development (schema)

Pre-production setups may use TypeORM `synchronize: true` or reset the dev database after entity changes; add proper migrations before production.

---

## Modules and routes (sketch)

### Auth

| Method | Path | Who | Notes |
|--------|------|-----|--------|
| POST | `/auth/register` | Public | Create user; default role author. Body: email, password, displayName; optional affiliation, orcid (0000-0000-0000-000X), reviewKeywords, willingToReview. |
| POST | `/auth/login` | Public | Returns access JWT (+ refresh if implemented). |
| POST | `/auth/logout` | Authenticated | Optional; mainly client discards token if stateless. |
| GET | `/auth/me` | Authenticated | Current user + roles. |

### Users (minimal)

| Method | Path | Who | Notes |
|--------|------|-----|--------|
| GET | `/users/me` | Authenticated | Profile; may duplicate `/auth/me`—pick one pattern. |
| GET | `/users/me/role-invitations` | Authenticated | Pending editor (etc.) invitations for the current user. |
| POST | `/users/:id/role-invitations` | Editor (`users.manage_roles`) | Body: `{ "roleSlug": "editor" }`. Creates invitation; does not grant role until accept. |
| POST | `/role-invitations/:id/accept` | Invitee | JWT only; merges role into user’s roles. |
| POST | `/role-invitations/:id/decline` | Invitee | JWT only. |
| PATCH | `/users/me` | Authenticated | Update display name; role changes **editor-only** or seed-only for MVP. |
| PATCH | `/users/:id/roles` | Editor (`users.manage_roles`) | Replace role set. **Cannot** newly add `editor` unless invitee accepted a role invitation—use `POST .../role-invitations` first. |

### Submissions

| Method | Path | Who | Notes |
|--------|------|-----|--------|
| GET | `/submissions` | Author | Own submissions only. |
| GET | `/submissions` | Editor | Queue filter by status query params. |
| POST | `/submissions` | Author | Create `draft`. Body: `title`, `abstract`; optional article metadata (type, keywords, contributors JSON, funding, declarations, suggested/opposed reviewers). |
| GET | `/submissions/:slug` | Author / Editor / Assigned reviewer | Slug in path. JSON is **viewer-specific** (see Peer review policy above). |
| PATCH | `/submissions/:slug` | Author | Full metadata when `draft` or `revisions_requested` (title, abstract, article type, keywords, contributors, declarations, reviewer preferences). |
| PATCH | `/submissions/:slug/review-method` | Editor | Body: `{ "reviewMethod": "open" \| "anonymous" \| "double_anonymous" }`. Requires `submission.change_status` **or** `submission.assign_reviewer`. |
| POST | `/submissions/:slug/submit` | Author | `draft` → `submitted` (or resubmit from `revisions_requested`). Validates journal-style checklist; new author uploads default `file_stage = submission`. |
| PATCH | `/submissions/:slug/status` | Editor | Transitions with validation; `under_review` requires a review-package manuscript (see policy). |

### Files

| Method | Path | Who | Notes |
|--------|------|-----|--------|
| POST | `/submissions/:slug/files` | Author | Multipart field `file`; query `kind` = `cover_letter` \| `title_page` \| `manuscript` \| `figure` \| `table` \| `supplementary` (default `manuscript`). New rows default `file_stage = submission`. |
| PATCH | `/submissions/:slug/files/:fileId/stage` | Editor | Body: `{ "fileStage": "submission" \| "review" }`. Requires `submission.change_status` **or** `submission.assign_reviewer`. |
| GET | `/submissions/:slug/files/:fileId` | Author / Editor / Assigned reviewer / Public | Reviewers: **review-stage files only** (unless public published artifact). |
| DELETE | `/submissions/:slug/files/:fileId` | Author | `draft` or `revisions_requested` when replacing files. |

### Review assignments

Assignment `status`: `invited` (awaiting reviewer response), `accepted` (reviewer agreed; can access files and submit), `declined`, `completed` (review submitted). Creating an assignment sets `invited` and does **not** move the submission to `under_review` until the reviewer **accepts** (if the submission was `submitted`).

| Method | Path | Who | Notes |
|--------|------|-----|--------|
| POST | `/submissions/:slug/assignments` | Editor | Body: `reviewerId`. Creates `ReviewAssignment` with status `invited` and an `outbound_event_outbox` row in one DB transaction. **Non-2xx** means no assignment was stored (e.g. outbox insert failed). **2xx** means both committed; broker downtime only delays publish, not this HTTP step. |
| GET | `/submissions/:slug/assignments` | Editor | List assignments (+ reviewer). |
| GET | `/assignments/me` | Reviewer | All of the reviewer’s assignments. |
| POST | `/assignments/:slug/accept` | Reviewer | `invited` → `accepted`; may set submission `submitted` → `under_review`. |
| POST | `/assignments/:slug/decline` | Reviewer | `invited` → `declined`. |

### Reviews

| Method | Path | Who | Notes |
|--------|------|-----|--------|
| POST | `/assignments/:slug/reviews` | Reviewer | Only if assignment status is `accepted`. Body: `commentsForAuthor`, `commentsToEditorOnly`, `recommendation`. **At least one** of the two comment fields must be non-empty. |
| GET | `/submissions/:id/reviews` | Editor | All reviews for submission (full text + recommendation + assignment/reviewer metadata). |
| GET | `/submissions/:id/reviews` | Author | Redacted list: `id`, `commentsForAuthor`, `submittedAt` only (no confidential text, no recommendation, no reviewer identity). |
| GET | `/submissions/:id/reviews` | Reviewer | Only own review, full fields—avoid leaking other reviewers if blind. |

### Public catalog

| Method | Path | Who | Notes |
|--------|------|-----|--------|
| GET | `/publications` or `/public/submissions` | Public | List `published` only; pagination. |
| GET | `/public/submissions/:id` | Public | Published metadata + link to downloadable file. |

---

## Phase 2 (email — editorial workflow)

- **Shipped:** submission-received emails to all editors (`submission.submitted`)
  and editor-decision emails to the author (`submission.decision`) via the
  same [`email-service`](./plans/email-service.md) pipeline as reviewer/copyedit mail.
- **Still deferred:** review-submitted → editor, published → author, role-invitation
  email, auth/welcome mail.
- WebSockets or SSE for in-app notifications.
- Refresh tokens, OAuth, ORCID.

## Eventing

The backend publishes domain events to a topic exchange named
`folio.events` on RabbitMQ. The email microservice consumes them.
Routing keys, queue layout, and the dead-letter exchange are documented
in [`docs/plans/email-service.md`](./plans/email-service.md).

| Routing key | Producer | Consumer | Effect |
|-------------|----------|----------|--------|
| `reviewer.invited` | Backend (`assignReviewer`) | email-service | Sends invitation email + schedules due-soon / overdue reminders |
| `reminder.due` | email-service cron | email-service | Sends a reminder email; same template/provider path as immediate sends |
| `copyedit.assigned` | Backend (`assignCopyeditor`) | email-service | Notifies copyeditor of assignment |
| `copyedit.queries_sent` | Backend (`submitCopyeditNote`) | email-service | Notifies author of copyedit queries |
| `copyedit.author_ready` | Backend (`markCopyeditAuthorReady`) | email-service | Notifies copyeditor author is ready |
| `submission.submitted` | Backend (`submit`) | email-service | Notifies each editor (one outbox row per editor) |
| `submission.decision` | Backend (`updateStatus` → accepted/rejected/revisions_requested) | email-service | Notifies author of editorial decision |

Operational view (counts only, no PII):
`GET /health/outbox` returns the backend outbox state (`pending`,
`published`, `dead` plus the oldest pending row).

Editors with JWT and permission `email.manage_reminders` may call
`GET /admin/email/pipeline-status` for a fuller operational snapshot:
outbox counts and redacted samples of dead rows, `email.email_log` counts
and recent failed rows (no recipient), `email.reminder` counts plus
“stuck” pending past schedule, and **cached** passive RabbitMQ queue
depths (`folio.events.dlq`, `email.reviewer_invited`, `email.reminder_due`).
When the broker is unreachable, database sections still return; `rabbitMq.available`
is `false`. Tune cache TTL with `EMAIL_QUEUE_METRICS_CACHE_MS` (default 20000).

---

## Health

| Method | Path | Who |
|--------|------|-----|
| GET | `/health` | Public |

Use for load balancers and first vertical slice smoke tests.
