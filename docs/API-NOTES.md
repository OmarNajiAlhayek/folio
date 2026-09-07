# API notes (NestJS, MVP)

High-level REST contract for the NestJS app in `backend/`. Implementation follows this sketch; data and statuses match [`DATA-MODEL.md`](./DATA-MODEL.md) and role workflows in [`feature-report.md`](./feature-report.md).

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

- **Auth (browser):** httpOnly cookie `folio_access` (JWT) on `Path=/api/v1`, plus double-submit CSRF cookie `folio_csrf` and header `X-CSRF-Token` on `POST`/`PUT`/`PATCH`/`DELETE`. Frontend calls the API same-origin via Next.js rewrite (`/api/v1` → Nest).
- **RBAC layers:** route `@Permissions()` guard vs service caller/resource checks — see [`authorization.md`](./authorization.md).
- **Auth (automation):** `Authorization: Bearer <token>` when `AUTH_RETURN_BEARER=true` (Playwright, scripts). Bearer requests skip CSRF.
- **Rate limits:** Exceeded limits return `429` with `code: TOO_MANY_REQUESTS` and message `Too many requests. Please try again in a minute.` Counters are per **handler** (controller + method name), not per URL pattern alone. In-memory storage (single instance); horizontal scale needs Redis-backed `ThrottlerStorage` (same limitation class as the notifications SSE hub).
  - **Global baseline (`default`, IP):** all routes except health probes.
  - **Public (`public`, IP):** `GET /public/submissions`, `GET /public/manuscript-styles`, and related public handlers — plus `default`.
  - **Auth (`login` / `register`, IP):** `POST /auth/login`, `POST /auth/register` — plus `default`.
  - **Upload (`upload`, user):** multipart submission uploads and `POST /submissions/import-docx-to-constructor` — plus global `default` @ IP.
  - **DOCX (`docx`, user):** `POST /submissions/generate-docx-standalone`, `POST /submissions/:slug/generate-docx`.
  - **SSE (`sse`, user):** `GET /notifications/stream` new connections — plus global `default` @ IP.
  - **Health:** `GET /health`, `GET /health/outbox` are never throttled.
  - **Env:** `THROTTLE_TTL_MS`, `THROTTLE_DEFAULT_LIMIT`, `THROTTLE_PUBLIC_LIMIT`, `THROTTLE_UPLOAD_LIMIT`, `THROTTLE_DOCX_LIMIT`, `THROTTLE_SSE_LIMIT`, `THROTTLE_LOGIN_LIMIT`, `THROTTLE_REGISTER_LIMIT`, `THROTTLE_REFRESH_LIMIT`, `THROTTLE_AUTH_OTP_LIMIT`, `THROTTLE_AUTH_PASSWORD_RESET_LIMIT` in `backend/.env`.
  - **Behind a proxy:** set `NODE_ENV=production` so Express `trust proxy` is enabled and IP limits use the client address (see `backend/src/main.ts`).
- **Uploads:** `POST /submissions/:slug/files` validates extension + magic bytes per `kind`; max 25MB; temp disk then move to `UPLOAD_DIR`.

### Submission `status` in API

Must include `copyediting` between acceptance and publication: `draft`, `submitted`, `under_review`, `revisions_requested`, `accepted`, `rejected`, `copyediting`, `published`, `retracted`. Transitions enforced in service layer, not ad hoc from clients.

### Copyediting

- **Assign:** `POST /submissions/:slug/copyedit-assignments` body `{ copyeditorId }` — submission must be `accepted` or already `copyediting`; duplicate copyeditor per submission rejected; multiple different copyeditors allowed; first assignment sets submission `status` to `copyediting`.
- **List (editor):** `GET /submissions/:slug/copyedit-assignments` — assignments with copyeditor + notes.
- **Queue (copyeditor):** `GET /copyedit-assignments/me` — assignments for the current copyeditor, nested submission summary.
- **Queries:** `POST /copyedit-assignments/:assignmentSlug/notes` body `{ noteForAuthor, noteToEditorOnly? }` — assignment `active` or `ready_for_review` → `awaiting_author`; emits `copyedit.queries_sent`.
- **Author ready:** `POST /copyedit-assignments/:assignmentSlug/ready` — author only; requires new `manuscript` upload after latest note; emits `copyedit.author_ready`.
- **Approve without author round:** `POST /copyedit-assignments/:assignmentSlug/approve-ready` — copyeditor (assignment owner); assignment must be `active`; sets `ready_for_review` (no email).
- **Publish:** `POST /submissions/:slug/publish` — assigned copyeditor, or a chief editor (`copyedit.publish` + `submission.view_editor_queue`); all assignments must be `ready_for_review`.
- **Retract:** `POST /submissions/:slug/retract` — chief editor or journal manager (`submission.view_editor_queue`); `published` → `retracted`. Drops public files and catalog/search visibility. Terminal.
- **List notes:** `GET /submissions/:slug/copyedit-notes` — timeline with `round`, `assignmentSlug`; author sees `noteForAuthor` only.
- **AI analysis:** `POST /copyedit-assignments/:assignmentSlug/ai-analysis` — copyeditor (assignment owner) or editor. Returns `{ formatIssues, grammarNotes, referenceIssues, aiUnavailable }`. Format rules are local (Damascus profile). Grammar uses LanguageTool when `LANGUAGE_TOOL_ENABLED=true` (empty array when disabled/unavailable). Reference cross-check uses gRPC `CopyeditService` when `AI_COPYEDIT_ENABLED=true` (`aiUnavailable: true` when disabled/unreachable).
- **Dev DB:** drop unique on `copyedit_notes.assignment_id` when migrating from one-note schema (TypeORM `synchronize` on fresh DBs applies automatically).

### Peer review policy (OJS-style)

- **`GET /submissions/:slug`** returns a **JSON-shaped submission** that depends on the caller: editors and authors see full metadata (and full file lists); **assigned reviewers** see a **redacted** payload per [`DATA-MODEL.md`](./DATA-MODEL.md) (review method × metadata matrix), **only files with `file_stage = review`**, and never `constructor_content` or `review_assignments`.
- **`GET /assignments/me`** nests the same reviewer-safe submission summary under each assignment.
- **Reviewer review files** (`kind = review_response`) are editor-only until an editor releases them. The author never sees an unreleased one in `files[]` and cannot download it; once released it arrives under an anonymised `originalName`/`displayName` (`Reviewer 2 — review file.docx`). Reviewers never see another reviewer's review file, even though it sits in the review stage.
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
| POST | `/auth/login` | Public | Sets auth cookies; JSON `{ user }` only (adds `accessToken` when `AUTH_RETURN_BEARER=true`). |
| POST | `/auth/verify-email/send` | Authenticated | Resend 6-digit verification OTP (throttled). No-op if already verified. |
| POST | `/auth/verify-email` | Authenticated | Body `{ code }` — confirms email ownership; sets `emailVerified` on profile. |
| POST | `/auth/forgot-password` | Public | Body `{ email }` — always returns `{ ok: true }`; enqueues reset email when account exists. |
| GET | `/auth/reset-password/validate?token=` | Public | Returns `{ valid: true }` or 400 when token invalid/expired. |
| POST | `/auth/reset-password` | Public | Body `{ token, password }` — updates password and revokes all refresh sessions. |
| POST | `/auth/logout` | Authenticated | Clears cookies and revokes the current JWT session id (`jti`) server-side; other devices/sessions stay signed in until their tokens expire. Requires CSRF when using cookie session (not when using `Authorization: Bearer`). |
| GET | `/auth/me` | Authenticated | Current user + roles + `emailVerified`. |

**ORCID OAuth** (enabled with `ORCID_ENABLED=true` in `backend/.env`):

| Method | Path | Who | Notes |
|--------|------|-----|--------|
| GET | `/auth/orcid` | Public | Redirects to ORCID authorization page. |
| GET | `/auth/orcid/callback` | Public (ORCID redirect) | Exchanges code for token; creates or links account; sets auth cookies. |
| POST | `/auth/orcid/link` | Authenticated | Link current account to an ORCID identity (body: `{ code }`). |
| DELETE | `/auth/orcid/unlink` | Authenticated | Remove ORCID link from current account. |

### Users (minimal)

> **Section-editor scope** is expressed as journal slugs:
> `GET /users/:id/section-editor-journals` (any authenticated user) and
> `PUT /users/:id/section-editor-journals` with `{ "journals": ["engj", …] }`
> (`users.manage_roles`). Unknown slugs are rejected. This surface spoke Arabic
> discipline labels before slice 7.

| Method | Path | Who | Notes |
|--------|------|-----|--------|
| GET | `/users` | Journal manager (`users.manage_roles`) | Query: `q` (email/display name), `limit` (1–50, default 20), `offset`. Returns `{ items, total }` with `roleSlugs`, `willingToReview`, `pendingRoleInvitations`. UI: `/journal-manager/users`. |
| GET | `/users/me` | Authenticated | Profile; may duplicate `/auth/me`—pick one pattern. |
| GET | `/users/me/role-invitations` | Authenticated | Pending editor (etc.) invitations for the current user. |
| POST | `/users/:id/role-invitations` | Journal manager (`users.manage_roles`) | Body: `{ "roleSlug": "editor" }` or `"journal_manager"`. Creates invitation; does not grant role until accept. |
| POST | `/role-invitations/:id/accept` | Invitee | JWT only; merges role into user’s roles. |
| POST | `/role-invitations/:id/decline` | Invitee | JWT only. |
| PATCH | `/users/me` | Authenticated | Update display name; role changes **editor-only** or seed-only for MVP. |
| PATCH | `/users/:id/roles` | Journal manager (`users.manage_roles`) | Replace role set. **Cannot** newly add `editor` or `journal_manager` without invitation—use `POST .../role-invitations` first. |

### Submissions

| Method | Path | Who | Notes |
|--------|------|-----|--------|
| GET | `/submissions` | Author | Own submissions only. |
| GET | `/submissions` | Editor | Queue filter by status query params. |
| POST | `/submissions` | Author | Create `draft`. Body: **`journalId` (required)**, `title`, `abstract`; optional article metadata (type, keywords, contributors JSON, funding, declarations, suggested/opposed reviewers). A retired or unknown journal is `400 JOURNAL_NOT_AVAILABLE`. |
| GET | `/submissions/journal-options` | Author / Editor | Journals accepting submissions — the author picker's options: `{ id, slug, titleAr, titleEn, disciplineLabel }[]`. |
| GET | `/submissions/:slug` | Author / Editor / Assigned reviewer | Slug in path. JSON is **viewer-specific** (see Peer review policy above). |
| PATCH | `/submissions/:slug` | Author | Full metadata when `draft` or `revisions_requested` (title, abstract, article type, keywords, contributors, declarations, reviewer preferences). Optional `journalId` moves the manuscript to another journal while it is still editable. |
| PATCH | `/submissions/:slug/review-method` | Editor | Body: `{ "reviewMethod": "open" \| "anonymous" \| "double_anonymous" }`. Requires `submission.change_status` **or** `submission.assign_reviewer`. |
| POST | `/submissions/:slug/submit` | Author | `draft` → `submitted` (or resubmit from `revisions_requested`). Validates journal-style checklist; new author uploads default `file_stage = submission`. |
| PATCH | `/submissions/:slug/status` | Editor | Body: `{ "status": "…", "messageForAuthor"?: string, "revisionSeverity"?: "minor" \| "major", "releaseReviewFileIds"?: string[] }`. `revisionSeverity` is **required** for `revisions_requested` and rejected otherwise; it also bumps `revision_round`. `releaseReviewFileIds` releases reviewer `review_response` files to the author in the same transaction. Optional `messageForAuthor` (max 4000 chars) when setting `accepted`, `rejected`, or `revisions_requested`; persisted on the submission and included in the author decision email. `under_review` requires a review-package manuscript (see policy). |
| GET | `/submissions/discipline-labels` | Author / Editor | Arabic discipline label list; optional journal scope via `JOURNAL_ALLOWED_DISCIPLINES`. |
| POST | `/submissions/:slug/suggest-discipline` | Author (draft) | Calls ai-service `ClassifierService`; stores `disciplineSuggestedLabels` + classification JSON. Returns `topLabel`, `suggestedLabels[]`, `probabilities`. Requires `AI_SERVICE_ENABLED` + classifier enabled on ai-service. |
| POST | `/submissions/:slug/suggest-keywords` | Author (draft) | Returns suggested EN/AR keyword lists (not persisted). Requires `AI_KEYWORDS_ENABLED`. |
| POST | `/submissions/suggest-keywords-preview` | Author | Body: optional `title`, `abstract`, `titleAr`, `abstractAr` — same keyword RPC before a slug exists. |
| PATCH | `/submissions/:slug/discipline` | Author / Editor | Body: `{ "disciplines": ["<label>", ...] }` (1–3 labels) — confirm or override; sets `discipline_source` to `author` or `editor`. |
| GET | `/submissions/:slug/corpus-similarity` | Editor / assigned reviewer (accepted or completed) | Corpus overlap report via `PlagiarismService`. **Not** available to authors or copyeditors-only. Requires `AI_SIMILARITY_ENABLED`. Returns `{ status: "unavailable" \| "no_text" \| "ok", ... }` when disabled or insufficient text. |
| GET | `/submissions/:slug/suggested-reviewers` | Editor | Ranked reviewer candidates via `ReviewerMatchingService`. Requires `AI_REVIEWER_MATCHING_ENABLED`. |
| GET | `/submissions/:slug/publishable-issues` | Copyeditor / Editor | Issues of **this submission's journal** that can receive it (`open` or `published`). Read through the submission so an unplaced manuscript leaks no other journal's issues. |
| POST | `/submissions/:slug/publish` | Copyeditor / Editor | Body: `{ "issueId": "<uuid>" }`. Files the article into an issue and flips to `published` in one transaction. |

### AI feature flags and errors

Nest talks to ai-service over **gRPC** (`AI_SERVICE_GRPC_HOST`, default port `5246`). See [`plans/ai-service.md`](./plans/ai-service.md) and [`backend/.env.example`](../backend/.env.example).

| Flag | Enables |
|------|---------|
| `AI_SERVICE_ENABLED` | gRPC client; discipline classify on submit when classifier is enabled |
| `AI_KEYWORDS_ENABLED` | Keyword suggestion routes |
| `AI_SIMILARITY_ENABLED` | Related articles, semantic catalog, corpus similarity |
| `AI_REVIEWER_MATCHING_ENABLED` | Suggested reviewers for editors |
| `AI_COPYEDIT_ENABLED` | Copyedit reference cross-checking (`CopyeditService.CheckReferences`) |

**LanguageTool (Nest-only, not ai-service):** `LANGUAGE_TOOL_ENABLED`, `LANGUAGE_TOOL_URL` (default `http://localhost:8010`). Used by copyedit AI analysis for grammar/spelling; returns empty results when disabled.

Common error codes when AI is misconfigured or unreachable: `AI_SERVICE_UNAVAILABLE`, `AI_CLASSIFICATION_FAILED`, `AI_KEYWORDS_SUGGESTION_FAILED`. Routes may return soft-empty payloads instead of 5xx where noted (e.g. corpus similarity `status: unavailable`; copyedit analysis sets `aiUnavailable: true`).

### Files

| Method | Path | Who | Notes |
|--------|------|-----|--------|
| POST | `/submissions/:slug/files` | Author | Multipart field `file`; query `kind` = `cover_letter` \| `title_page` \| `manuscript` \| `figure` \| `table` \| `supplementary` (default `manuscript`). New rows default `file_stage = submission`. |
| PATCH | `/submissions/:slug/files/:fileId/stage` | Editor | Body: `{ "fileStage": "submission" \| "review" }`. Requires `submission.change_status` **or** `submission.assign_reviewer`. |
| GET | `/submissions/:slug/files/:fileId` | Author / Editor / Assigned reviewer / Public | Reviewers: **review-stage files only** (unless public published artifact). |
| DELETE | `/submissions/:slug/files/:fileId` | Author | `draft` or `revisions_requested` when replacing files. |
| PATCH | `/submissions/:slug/files/:fileId/release` | Editor | Body: `{ "released": boolean }`. `review_response` files only; requires `submission.change_status`. Releases a reviewer's review file to the author, or revokes it. |

### Review assignments

Assignment `status`: `invited` (awaiting reviewer response), `accepted` (reviewer agreed; can access files and submit), `declined`, `completed` (review submitted). Creating an assignment sets `invited` and does **not** move the submission to `under_review` until the reviewer **accepts** (if the submission was `submitted`).

| Method | Path | Who | Notes |
|--------|------|-----|--------|
| POST | `/submissions/:slug/assignments` | Editor | Body: `reviewerId`. Creates `ReviewAssignment` with status `invited` and an `outbound_event_outbox` row in one DB transaction. **Non-2xx** means no assignment was stored (e.g. outbox insert failed). **2xx** means both committed; broker downtime only delays publish, not this HTTP step. |
| GET | `/submissions/:slug/assignments` | Editor | List assignments (+ reviewer). |
| GET | `/assignments/me` | Reviewer | All of the reviewer’s assignments. |
| POST | `/assignments/:slug/accept` | Reviewer | `invited` → `accepted`; may set submission `submitted` → `under_review`. |
| POST | `/assignments/:slug/decline` | Reviewer | `invited` → `declined`. |
| GET | `/assignments/:slug/files` | Reviewer | The reviewer's own uploaded `review_response` files for this assignment. |
| POST | `/assignments/:slug/files` | Reviewer | Multipart `file`. Assignment must be `accepted`. Stored as `kind = review_response`, `file_stage = review`, linked to the assignment. PDF/DOCX, max 25 MB. |
| DELETE | `/assignments/:slug/files/:fileId` | Reviewer | Withdraw an own review file. Refused once an editor has released it to the author. |

### Copyedit assignments

| Method | Path | Who | Notes |
|--------|------|-----|--------|
| GET | `/copyedit-assignments/me` | Copyeditor | Queue with nested submission summary. |
| POST | `/copyedit-assignments/:slug/notes` | Copyeditor | Production query round; emails author. |
| POST | `/copyedit-assignments/:slug/ready` | Author | Marks assignment ready after revised manuscript upload. |
| POST | `/copyedit-assignments/:slug/ai-analysis` | Copyeditor (owner) / Editor | Format + grammar + reference analysis (see Copyediting section). |

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
| GET | `/public/submissions` | Public | Paginated list of `published` submissions. Response: `{ items, total, limit, offset }`. Query filters: `q`, `author`, `journal` (slug, e.g. `engj`), `discipline`, `articleType`, `publishedFrom`, `publishedTo`. Keyword mode: optional `limit` (1–100, default 20), `offset` (default 0). |
| GET | `/public/submissions` | Public | `searchMode=keyword` (default) — Postgres FTS + `pg_trgm`; or **Typesense** when `TYPESENSE_ENABLED=true` (weighted multi-field, typo tolerance, prefix match). `searchMode=semantic` requires `q` and `AI_SIMILARITY_ENABLED` on backend + `SIMILARITY_ENABLED` on ai-service; optional `semanticLimit` (1–30, default 20); returns same paginated envelope with `offset` 0. |
| GET | `/public/submissions/author-suggestions` | Public | Typeahead for catalog author filter. Query: `q` (min 2 chars), optional `limit` (1–20, default 10). |
| GET | `/public/submissions/:slug` | Public | Published metadata + downloadable files. |
| GET | `/public/manuscript-styles` | Public | Constructor / DOCX style profiles. |
| GET | `/public/journals` | Public | The press: every active journal with article count and latest released issue. |
| GET | `/public/journals/:slug` | Public | One journal with its **published** issues, newest first. |
| GET | `/public/journals/:slug/issues/:year/:number` | Public | Issue table of contents — journal, issue citation (العدد N، السنة YYYY), and published articles. |
| POST | `/public/search/click` | Public | Record a Typesense click event for search analytics. Body: `{ q, docId, userId? }`. No-op when Typesense is disabled. Fire-and-forget (always 204). |

Legacy alias `GET /publications` may redirect or mirror catalog list depending on deployment; prefer `/public/submissions`.

### Editor search curation (Typesense)

Requires `TYPESENSE_ENABLED=true`. All routes need JWT + `submission.view_editor_queue` permission; `reindex` additionally requires `users.manage_roles` (journal manager).

| Method | Path | Notes |
|--------|------|-------|
| GET | `/editor/search/status` | Typesense collection health and indexed document count. |
| GET | `/editor/search/analytics` | Top 20 searched queries and top 20 zero-result queries (from Typesense analytics rules). |
| POST | `/editor/search/reindex` | Trigger a full background reindex of all published submissions. Returns 202; 409 when already running. |
| GET | `/editor/search/overrides` | List all search result override rules. |
| PUT | `/editor/search/overrides/:id` | Create or update an override (pin / exclude documents for a query). Body: `{ rule: { query, match }, includes?: [...], excludes?: [...] }`. |
| DELETE | `/editor/search/overrides/:id` | Delete an override (204). |
| GET | `/editor/search/synonyms` | List all synonym rules (multi-way and one-way). |
| PUT | `/editor/search/synonyms/:id` | Create or update a synonym rule. Body: `{ synonyms: string[], root?: string }`. |
| DELETE | `/editor/search/synonyms/:id` | Delete a synonym (204). |

**Background sync:** `SearchSyncService` runs every 5 minutes (incremental, checkpoint-based) and bootstraps on startup. Published submissions are automatically upserted; unpublished/deleted ones are removed. Weighted query fields: `title` (4), `titleAr` (3), `keywords` (4), `keywordsAr` (3), `abstract` (2), `abstractAr` (2), `authorDisplayName` (1). Facets: `disciplines` (`string[]`), `articleType`. Catalog `discipline` query param filters by overlap (any-of).

### Audit log

Every non-health API request is recorded in `audit_log` (sampled by `AUDIT_SAMPLE_RATE` in `backend/.env`, default `1.0`). Sensitive fields (password, token, OTP) are automatically redacted in the stored request body.

| Method | Path | Who | Notes |
|--------|------|-----|--------|
| GET | `/audit/logs` | `audit.log.view` permission | Query params: `userId`, `startDate` (ISO-8601), `endDate`, `method`, `routePattern`, `actionType`, `resourceType`, `resourceId`, `page` (default 1), `limit` (1–100, default 20). Returns `{ items, total, page, limit }`. |

---

## Phase 2 (email — editorial workflow)

- **Shipped:** submission-received emails to all editors (`submission.submitted`)
  and editor-decision emails to the author (`submission.decision`) via the
  same [`email-service`](./plans/email-service.md) pipeline as reviewer/copyedit mail.
- **Shipped (phase 3):** review-submitted, reviewer accept/decline → editors;
  submission-published → author; role-invitation → invitee.
- **Shipped (auth):** email verification OTP (`auth.verification_otp`) on register/resend; password reset magic link (`auth.password_reset`) via `POST /auth/forgot-password`; registration welcome (`auth.registration_welcome`) after successful `POST /auth/verify-email`. Unverified users may log in but cannot submit manuscripts, accept/decline reviews, submit reviews, or accept role invitations until `POST /auth/verify-email`.
- **Shipped:** in-app notifications (REST inbox, SSE live updates, header bell). See `GET /notifications`, `GET /notifications/stream`.
- Refresh tokens, OAuth, ORCID.

## Eventing

The backend publishes domain events to a topic exchange named
`folio.events` on RabbitMQ. The email microservice consumes them.
Routing keys, queue layout, and the dead-letter exchange are documented
in [`docs/plans/email-service.md`](./plans/email-service.md).

| Routing key | Producer | Consumer | Effect |
|-------------|----------|----------|--------|
| `reviewer.invited` | Backend (`assignReviewer`) | email-service | Sends invitation email + schedules due-soon / overdue reminders |
| `reviewer.responded` | Backend (`declineReviewInvitation`, `submitReview`) | email-service | Cancels pending reminders for the assignment (decline or review complete; accept does not cancel) |
| `reminder.due` | email-service cron | email-service | Sends a reminder email; same template/provider path as immediate sends |
| `copyedit.assigned` | Backend (`assignCopyeditor`) | email-service | Notifies copyeditor of assignment |
| `copyedit.queries_sent` | Backend (`submitCopyeditNote`) | email-service | Notifies author of copyedit queries |
| `copyedit.author_ready` | Backend (`markCopyeditAuthorReady`) | email-service | Notifies copyeditor author is ready |
| `submission.submitted` | Backend (`submit`) | email-service | Notifies each editor and journal manager (one outbox row per recipient) |
| `submission.decision` | Backend (`updateStatus` → accepted/rejected/revisions_requested) | email-service | Notifies author of editorial decision |
| `submission.under_review` | Backend (`updateStatus` → under_review from submitted, or reviewer accept auto-transition) | email-service | Notifies author that peer review has started |
| `submission.published` | Backend (`publishSubmission`) | email-service | Notifies author when copyeditor publishes |
| `review.submitted` | Backend (`submitReview`) | email-service | Notifies each editor and journal manager |
| `review.invitation_accepted` | Backend (`acceptReviewInvitation`) | email-service | Notifies each editor and journal manager |
| `review.invitation_declined` | Backend (`declineReviewInvitation`) | email-service | Notifies each editor and journal manager |
| `role.invitation` | Backend (`POST …/role-invitations`) | email-service | Notifies invitee of privileged role invite |
| `auth.verification_otp` | Backend (`register`, `POST /auth/verify-email/send`) | email-service | Sends 6-digit email verification code |
| `auth.password_reset` | Backend (`POST /auth/forgot-password`) | email-service | Sends password reset magic link |
| `auth.registration_welcome` | Backend (`POST /auth/verify-email`) | email-service | Sends welcome/onboarding mail after first successful verification |

Operational view (counts only, no PII):
`GET /health/outbox` returns the backend outbox state (`pending`,
`published`, `dead` plus the oldest pending row).

Open by default so the k6 harness, the e2e suite and local development work
unchanged. Set `OPS_METRICS_TOKEN` on a deployed instance and the endpoint then
requires an `x-folio-ops-token` header matching it — queue and dead-letter depth
tell an outsider whether mail delivery is broken.

Journal managers with JWT and permission `email.manage_reminders` may call
`GET /admin/email/pipeline-status` for a fuller operational snapshot:
outbox counts and redacted samples of dead rows, `email.email_log` counts
and recent failed rows (no recipient), `email.reminder` counts plus
“stuck” pending past schedule, and **cached** passive RabbitMQ queue
depths (`folio.events.dlq`, `email.reviewer_invited`, `email.reminder_due`).
When the broker is unreachable, database sections still return; `rabbitMq.available`
is `false`. Tune cache TTL with `EMAIL_QUEUE_METRICS_CACHE_MS` (default 20000).

`POST /admin/email/outbox/:id/requeue` resets a **`dead`** outbox row to
`pending` (clears attempts and `last_error`) so the drainer can republish
after the broker is healthy. **404** if the id is unknown; **409** if the
row is not `dead`.

---

## In-app notifications

Persisted per-user inbox (PostgreSQL `notifications`). Live updates via SSE while the app is open.

| Method | Path | Who | Notes |
|--------|------|-----|--------|
| GET | `/notifications` | JWT | `filter=all \| unread \| read` (default `all`), `limit` (max 50), `cursor` for pagination |
| GET | `/notifications/unread-count` | JWT | Badge count |
| PATCH | `/notifications/read-all` | JWT | Mark all unread read |
| PATCH | `/notifications/:id/read` | JWT | Mark one read (scoped to current user) |
| GET | `/notifications/stream` | JWT (cookie) | SSE: `connected` (unread count), `notification` (new row), `heartbeat` |

**SSE scaling:** `NotificationHub` is in-process only (one Node replica). Multi-instance deploys need a shared pub/sub fan-out — see `backend/src/notifications/README.md`.

---

## Health

| Method | Path | Who | Notes |
|--------|------|-----|-------|
| GET | `/health` | Public | Liveness — always returns 200 with `{ status, db, ... }`. Never gated. |
| GET | `/health/outbox` | Public, or `x-folio-ops-token` | Outbox stats: pending, published, dead counts + oldest pending row. Requires the header when `OPS_METRICS_TOKEN` is set. |
| GET | `/health/ai-jobs` | Public, or `x-folio-ops-token` | AI job counts by type and status. Same gating. |

Use for load balancers and first vertical slice smoke tests. Neither endpoint is throttled. Email-service exposes its own probes at `http://127.0.0.1:5244/health` (liveness) and `http://127.0.0.1:5244/ready` (readiness; checks DB and AMQP; returns 503 if degraded).
