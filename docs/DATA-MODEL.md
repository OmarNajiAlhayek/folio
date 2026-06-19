# Data model (MVP)

PostgreSQL as the system of record. Role workflows: [`feature-report.md`](./feature-report.md). API resources: [`API-NOTES.md`](./API-NOTES.md).

**Primary keys:** entity `id` columns are PostgreSQL `uuid`, generated in application code as **UUID v7** (time-ordered, RFC 4122) via `generateEntityId()` from `@folio/shared`. Public workflow URLs use **slugs** on `Submission`, `ReviewAssignment`, `CopyeditAssignment`, `Role`, and `Permission` — not the raw UUID.

## Entities

### Journal (optional stub)

Single row for “the one journal” (name, slug, ISSN optional). Simplifies future multi-journal expansion without MVP complexity. Omit the table if you hard-code journal metadata in config.

### User

- Identity: email (unique), password hash, display name.
- Researcher profile (editorial-manager style): optional **affiliation** (text), optional **ORCID** (unique when set), optional **review keywords / interests** (text), **willing to review** (boolean). New accounts default to **author**; reviewer candidates for assignment are users with the reviewer role **and** `willing_to_review = true`.
- Roles: `user_roles` join to `role` (and role → permission). MVP allows multiple roles per user. Manuscript create/edit/submit is gated by permission **`submission.manage_own`** (author role only). Staff roles: **`editor`** (handling editor — workflow decisions), **`journal_manager`** (users, email platform, queue oversight), **`reviewer`**, **`copyeditor`**. Editor and journal manager require invitation; reviewer/copyeditor can be assigned by a journal manager via `PATCH /users/:id/roles`.

### Submission

- Belongs to one **author** (`User` as `author_id`).
- Optional `journal_id` if you use the `Journal` table.
- Metadata: **title**, **abstract**, **article type** (enum), **keywords** (comma/semicolon-separated; 3–6 on submit), **contributors** (JSON array: full name, optional email, affiliation, sort order, corresponding flag), **funding statement**, **declarations** (conflict of interest, ethics/IRB reference, originality confirmation, AI-use statement), **suggested / opposed reviewers** (JSON arrays, max 5 each).
- **Discipline (Arabic journal scope, OJS category-like):** optional **`disciplines`** (`text[]`, confirmed labels, max 3), **`discipline_source`** (`ai` \| `author` \| `editor`), **`discipline_suggested_labels`** (`text[]`) + **`discipline_suggested_confidence`** (from AraBERT on suggest/submit), **`discipline_classification`** (JSONB snapshot of top labels/scores). Authors confirm via API; editors may override. Catalog filter and corpus similarity can scope by any confirmed label (similarity uses first).
- **`constructor_content`** (JSONB, nullable): Word Constructor document when the author uses builder mode; omitted from reviewer payloads.
- **`review_manuscript_presentation`** (JSONB, nullable): Which sources (upload / constructor `.docx`) are in the review package at submit.
- **`review_method`** (OJS-aligned enum, default `double_anonymous`): `open` | `anonymous` | `double_anonymous`. In UI/docs, label **`anonymous`** as **single-blind** (reviewer identity hidden from author; author identity still visible to reviewer unless `double_anonymous`).
- `status`: see [Submission lifecycle](#submission-lifecycle) (store as enum or constrained text).
- Timestamps: `created_at`, `updated_at`; optional `published_at` when `status = published`.

### SubmissionFile

- Belongs to one `Submission`.
- Fields: `storage_key` or path, original filename, MIME type, size, **`kind`**: `cover_letter` | `title_page` | `manuscript` | `figure` | `table` | `supplementary` (submit requires at least one file of each of the first three kinds), **`file_stage`**: `submission` (editorial package, default on author upload) | `review` (curated **review package** visible to reviewers), `created_at`.
- **Review package (uniform rule):** Reviewers may **only** download files with `file_stage = review`. Editors move or duplicate manuscripts into the review package before setting `under_review` or before a reviewer **accepts** (implementation requires ≥ one `manuscript` in `review` for those transitions). `open` review still uses a curated review file set; it does not grant reviewers the full submission tree.
- **File storage:** MVP default is local disk under something like `uploads/` (ignored by git via root `.gitignore`). Object storage (S3-compatible) is a later swap—keep DB metadata stable.

### ReviewAssignment

- Links `Submission` + `Reviewer` (`User` with reviewer role).
- Fields: `assigned_at`, optional `due_at`, `status`: `invited` (editor invited; no file access yet) | `accepted` (reviewer agreed; can read and submit) | `declined` | `completed` (review filed).

### RoleInvitation (staff roles)

- `invitee_user_id`, `invited_by_user_id`, `role_slug` (`editor` | `journal_manager` via API), `status` (`invited` | `accepted` | `declined`), `created_at`, optional `resolved_at`. Roles are applied only on **accept**. Direct `PATCH …/roles` cannot newly add these slugs without invitation.

### Review

- Belongs to one `ReviewAssignment` (one review document per assignment).
- Fields: `comments_for_author` (text, may be shown to the author), `comments_to_editor_only` (text, confidential to editors), `recommendation` (e.g. `accept` | `reject` | `revisions`), `submitted_at`. **At least one** of the two comment fields must be non-empty on submit.

### CopyeditAssignment

- Links `Submission` + **copyeditor** (`User` with copyeditor role).
- Fields: `slug` (unique, used in URLs), `status`: `active` | `awaiting_author` | `ready_for_review`, `assigned_at`.
- Multiple copyeditors per submission allowed; duplicate copyeditor per submission rejected.
- When the editor assigns the first copyeditor on an `accepted` submission, submission `status` moves to `copyediting`.

### CopyeditNote

- Belongs to one `CopyeditAssignment` (many rounds per assignment).
- Fields: `round` (1-based, monotonic per assignment), `note_for_author`, `note_to_editor_only`, `submitted_at`.
- Submitting a note moves assignment to `awaiting_author` and emails the author.

### Notification (in-app inbox)

- Belongs to one **recipient** `User` (`user_id`).
- Fields: `type` (stable string, e.g. `submission_submitted`), `title_key` / `body_key` (frontend i18n keys), `params` (JSONB, no email addresses), `href` (locale-less app path), `idempotency_key` (unique), `read_at` (null = unread), `created_at`.
- Rows are retained in v1 (no delete); SSE emits only **after** the insert transaction commits.

### OAuthIdentity (ORCID link)

- Belongs to one `User`.
- Fields: `provider` (e.g. `orcid`), `provider_user_id` (ORCID iD), `display_name`, `access_token` (encrypted), `refresh_token` (encrypted), `token_expiry`, `raw_profile` (JSONB), `created_at`, `updated_at`.
- Enabled when `ORCID_ENABLED=true` in `backend/.env`. A user may have at most one ORCID identity (`UNIQUE (user_id, provider)`).

### AuditLog

- Records every non-health API request to the backend.
- Fields: `user_id` (nullable), `user_email`, `user_roles` (text array), `method`, `route_pattern` (controller route, e.g. `/submissions/:slug`), `path` (actual URL), `status_code`, `ip_address`, `user_agent`, `request_body` (JSONB, sensitive keys redacted), `params` (JSONB), `duration_ms`, `action_type` (classified verb, e.g. `CREATE`, `UPDATE`, `DELETE`), `resource_type` (e.g. `SUBMISSION`, `USER`), `resource_id`, `occurred_at`, `error` (text, when applicable).
- Indexes: `(user_id, occurred_at)`, `(occurred_at)`, `(route_pattern, occurred_at)`, `(action_type, occurred_at)`, `(resource_type, resource_id, occurred_at)`.
- Sampling controlled by `AUDIT_SAMPLE_RATE` in `backend/.env` (0.0–1.0, default 1.0).

### SearchSyncCheckpoint

- Single-row table (id = 1) tracking the `last_synced_at` timestamp for incremental Typesense publication sync.
- Enables the `SearchSyncService` to resume from the last checkpoint after restarts without a full reindex.

---

## Review method × files × metadata (API responses for reviewers)

| `review_method` | Reviewer file downloads | Reviewer JSON (submission detail / `assignments/me`) |
|-----------------|-------------------------|------------------------------------------------------|
| `open` | `file_stage = review` only | Full metadata; **no** `constructor_content`, **no** `review_assignments` (avoid co-reviewer leak). |
| `anonymous` (single-blind) | `file_stage = review` only | Same visibility as open for author identity; same global omissions. |
| `double_anonymous` | `file_stage = review` only | Strip identifying fields (`author_id`, `author`, `contributors`, funding, COI, ethics, AI, etc.); same global omissions. |

---

## Submission lifecycle

Canonical **`status`** values on `Submission` (use these strings in API and UI):

| Status | Meaning |
|--------|---------|
| `draft` | Author editable; not visible to editor queue as “incoming” unless you choose to show drafts (default: no). |
| `submitted` | With editor; ready for assignment / in queue. |
| `under_review` | At least one active assignment; reviewers working. |
| `revisions_requested` | Editor sent back to author for changes. |
| `accepted` | Editorial accept; not yet on public site. |
| `rejected` | Terminal; not published. |
| `copyediting` | Accepted manuscript in production editing; one or more copyeditors assigned. |
| `published` | Visible in public catalog with file access per policy. |

**State machine (narrative):** The author creates a `draft`, then moves to `submitted`. The editor assigns reviewers and sets `under_review` via `PATCH .../status` (or status advances automatically on the first reviewer **accept** while still `submitted`, if a review-package manuscript exists). When enough reviews exist, the editor sets `accepted`, `rejected`, or `revisions_requested`. From `revisions_requested`, the author resubmits and status returns to `submitted` (then the editor may set `under_review` again). From `accepted`, copyediting and publish follow [`API-NOTES.md`](./API-NOTES.md). `rejected` does not move to `published` without a new submission (out of scope unless you define reopen).

Adjust edge cases in implementation, but **keep the same status strings** as [`API-NOTES.md`](./API-NOTES.md).

---

## ER diagram (Mermaid)

**ER diagrams (by domain):** [`diagrams/erd/README.md`](./diagrams/erd/README.md) — six focused Mermaid files (`01`–`06`). **ER diagrams (by role):** [`diagrams/erd-by-role/README.md`](./diagrams/erd-by-role/README.md). **Class diagrams (TypeORM):** [`diagrams/class/folio-overview.mmd`](./diagrams/class/folio-overview.mmd) (one Mermaid diagram, all roles) · [`diagrams/class/README.md`](./diagrams/class/README.md) (by domain) · [`diagrams/class-by-role/README.md`](./diagrams/class-by-role/README.md) (by role). **All links in one table:** [`diagrams/erd/LINKS.md`](./diagrams/erd/LINKS.md). Compact overview (no columns): [`diagrams/erd/folio-overview.puml`](./diagrams/erd/folio-overview.puml) / [`folio-overview.mmd`](./diagrams/erd/folio-overview.mmd). Optional full detail: [`diagrams/erd/folio-full.mmd`](./diagrams/erd/folio-full.mmd).

Mermaid `erDiagram` attributes must use `type name [PK|FK|UK]` only — no commas (`FK,UK`), no quoted `"nullable"`, avoid `enum` / `jsonb` / `timestamptz` as types (use `string`, `json`, `datetime`).

Simplified MVP view (no `Journal` table in code yet):

```mermaid
erDiagram
  User ||--o{ Submission : authors
  Submission ||--o{ SubmissionFile : has
  Submission ||--o{ ReviewAssignment : has
  Submission ||--o{ CopyeditAssignment : has
  User ||--o{ ReviewAssignment : reviewer
  User ||--o{ CopyeditAssignment : copyeditor
  User ||--o{ RoleInvitation : invitee
  User ||--o{ Notification : recipient
  ReviewAssignment ||--o| Review : has
  CopyeditAssignment ||--o{ CopyeditNote : has

  User {
    uuid id PK
    string email UK
    string password_hash
    string display_name
    datetime created_at
    datetime updated_at
  }

  Submission {
    uuid id PK
    uuid author_id FK
    string slug UK
    string title
    string abstract
    string status
    datetime created_at
    datetime updated_at
    datetime published_at
  }

  SubmissionFile {
    uuid id PK
    uuid submission_id FK
    string storage_key
    string kind
    string file_stage
    datetime created_at
  }

  ReviewAssignment {
    uuid id PK
    uuid submission_id FK
    uuid reviewer_id FK
    string slug UK
    string status
    datetime assigned_at
  }

  Review {
    uuid id PK
    uuid assignment_id FK
    string recommendation
    datetime submitted_at
  }

  CopyeditAssignment {
    uuid id PK
    uuid submission_id FK
    uuid copyeditor_id FK
    string slug UK
    string status
    datetime assigned_at
  }

  CopyeditNote {
    uuid id PK
    uuid assignment_id FK
    int round
    datetime submitted_at
  }

  RoleInvitation {
    uuid id PK
    uuid invitee_user_id FK
    uuid invited_by_user_id FK
    string role_slug
    string status
    datetime created_at
    datetime resolved_at
  }

  Notification {
    uuid id PK
    uuid user_id FK
    string type
    string idempotency_key UK
    datetime read_at
    datetime created_at
  }
```

---

## Indexes (implementation hint)

- `submissions(status, updated_at DESC)` — editor queue (`ix_submissions_status_updated_at`).
- `submissions(author_id, updated_at DESC)` — author list (`ix_submissions_author_updated_at`).
- `submissions(status, published_at)` — catalog ordering, search sync (`ix_submissions_status_published_at`).
- `submissions(status, similarity_indexed_at) WHERE similarity_indexed_at IS NULL` — pending similarity index (`ix_submissions_similarity_pending`).
- `review_assignments(reviewer_id, assigned_at DESC)` — reviewer inbox (`ix_review_assignments_reviewer_assigned`).
- `review_assignments(submission_id)` — per-submission assignment list (`ix_review_assignments_submission_id`).
- `CopyeditAssignment(copyeditor_id)`, `CopyeditAssignment(submission_id)`.
- `Notification(user_id, read_at)`, `Notification(idempotency_key)` unique.
- `outbound_event_outbox(status, next_attempt_at)` — outbox drainer.
- `User(email)` unique; `User(orcid)` unique where not null.
- `OAuthIdentity(user_id, provider)` unique.
- `AuditLog(user_id, occurred_at)`, `(occurred_at)`, `(route_pattern, occurred_at)`, `(action_type, occurred_at)`, `(resource_type, resource_id, occurred_at)`.
