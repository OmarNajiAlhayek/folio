# Damascus University Journal ERD — all links (one table)

**Diagrams (split, recommended):** [`README.md`](./README.md) — six small `.mmd` files; `users` / `submissions` repeat where needed.

**Combined (optional, large):** [`folio-full.mmd`](./folio-full.mmd). Render in VS Code, GitHub, or [mermaid.live](https://mermaid.live).

**Link types:** **FK** = TypeORM foreign key with `onDelete: CASCADE` · **FK†** = column only, no ORM FK · **Logical** = snapshot, event, or runtime reference · **Config** = no row-level parent.

| # | From (child) | To (parent) | Column(s) | Card. | Type | On delete | Notes |
|---|--------------|-------------|-----------|-------|------|-----------|--------|
| 1 | `user_roles` | `users` | `user_id` | N:1 | FK | CASCADE | Composite PK with `role_id` |
| 2 | `user_roles` | `roles` | `role_id` | N:1 | FK | CASCADE | Composite PK with `user_id` |
| 3 | `role_permissions` | `roles` | `role_id` | N:1 | FK | CASCADE | Composite PK with `permission_id` |
| 4 | `role_permissions` | `permissions` | `permission_id` | N:1 | FK | CASCADE | Composite PK with `role_id` |
| 5 | `submissions` | `users` | `author_id` | N:1 | FK | CASCADE | Manuscript author |
| 6 | `submission_files` | `submissions` | `submission_id` | N:1 | FK | CASCADE | Uploads and review-package files |
| 7 | `review_assignments` | `submissions` | `submission_id` | N:1 | FK | CASCADE | Peer-review assignment |
| 8 | `review_assignments` | `users` | `reviewer_id` | N:1 | FK | CASCADE | Reviewer user |
| 9 | `reviews` | `review_assignments` | `assignment_id` | 1:1 | FK | CASCADE | `assignment_id` unique |
| 10 | `copyedit_assignments` | `submissions` | `submission_id` | N:1 | FK | CASCADE | Production editing |
| 11 | `copyedit_assignments` | `users` | `copyeditor_id` | N:1 | FK | CASCADE | Duplicate copyeditor per submission blocked in app |
| 12 | `copyedit_notes` | `copyedit_assignments` | `assignment_id` | N:1 | FK | CASCADE | Copyedit rounds |
| 13 | `role_invitations` | `users` | `invitee_user_id` | N:1 | FK | CASCADE | Staff role invite |
| 14 | `role_invitations` | `users` | `invited_by_user_id` | N:1 | FK | CASCADE | Inviting user |
| 15 | `notifications` | `users` | `user_id` | N:1 | FK† | — | In-app inbox |
| 16 | `revoked_tokens` | `users` | `user_id` | N:1 | FK† | — | JWT logout blocklist (`jti` PK) |
| 17 | `outbound_event_outbox` | — | — | — | Config | — | Transactional outbox → RabbitMQ |
| 18 | `email.email_template` | — | — | — | Config | — | PK `(template_key, locale)` |
| 19 | `email.email_reminder_policy` | — | — | — | Config | — | Singleton reminder policy |
| 20 | `email.email_log` | — | — | — | Config | — | Send ledger; `idempotency_key` UK |
| 21 | `email.reminder` | `review_assignments` | `assignment_slug` | N:1 | Logical | — | Snapshot at invite; not a DB FK |
| 22 | `email.reminder` | `users` | `reviewer_id` | N:1 | Logical | — | Snapshot string; not `users.id` FK |
| 23 | `email.reminder` | `submissions` | `submission_title` | N:1 | Logical | — | Title snapshot only |
| 24 | `outbound_event_outbox` | `email.email_log` | event payload | 1:0..1 | Logical | — | Outbox → broker → email handler |
| 25 | `outbound_event_outbox` | `email.reminder` | domain events | 1:0..N | Logical | — | e.g. `reviewer.invited` creates reminders |
| 26 | `email.email_template` | `email.email_log` | `template` | 1:N | Logical | — | Template key + locale in handler |
| 27 | `email.email_reminder_policy` | `email.reminder` | `review_due_in_days` | 1:N | Logical | — | Scheduler sets `send_at` |
| 28 | `users` | `email.email_log` | `recipient` | 1:N | Logical | — | Email address string |

**Not implemented:** `Journal` table (see [`DATA-MODEL.md`](../../DATA-MODEL.md)). **ai-service** has no Postgres entities.

**Mermaid attribute rules:** use `datetime` not `timestamptz`; one of `PK` / `FK` / `UK` per token (space-separated, **no commas**); no quoted `"nullable"` suffixes.
