# Damascus University Journal ERD (split by domain)

The full model is split so each diagram stays small. **`users` and `submissions` repeat** where another slice needs context.

**Same schema by role (author, reviewer, editor, …):** [`../erd-by-role/`](../erd-by-role/)  
**UML class diagrams (TypeORM):** [`../class/`](../class/)

| Diagram | File | Tables |
|---------|------|--------|
| Identity & RBAC | [`01-identity-rbac.mmd`](./01-identity-rbac.mmd) | `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `role_invitations` |
| Manuscripts & files | [`02-manuscripts.mmd`](./02-manuscripts.mmd) | `users`, `submissions`, `submission_files` |
| Peer review | [`03-peer-review.mmd`](./03-peer-review.mmd) | `users`, `submissions`, `review_assignments`, `reviews` |
| Copyediting | [`04-copyedit.mmd`](./04-copyedit.mmd) | `users`, `submissions`, `copyedit_assignments`, `copyedit_notes` |
| Inbox & logout | [`05-inbox-auth.mmd`](./05-inbox-auth.mmd) | `users`, `notifications`, `revoked_tokens` |
| Email & events | [`06-email-events.mmd`](./06-email-events.mmd) | `outbound_event_outbox`, `email_*`, `reminder` (+ `users`, `review_assignments` for logical links) |

**All links (one table):** [`LINKS.md`](./LINKS.md)

**Overview (compact, no columns):** [`folio-overview.puml`](./folio-overview.puml) (PlantUML) · [`folio-overview.mmd`](./folio-overview.mmd) (Mermaid) — same shape as [`../class/folio-overview.puml`](../class/folio-overview.puml).

**Combined (one diagram for reports):** [`folio-full.mmd`](./folio-full.mmd) — all **19** tables, **essential columns** (LR layout for Word), FK + logical links. Full column lists: domain `.mmd` files above and [`DATA-MODEL.md`](../../DATA-MODEL.md). **Legend:** solid lines = Postgres FK (CASCADE); snapshot/outbox labels = no DB FK ([`LINKS.md`](./LINKS.md)). **Do not put `%%` comments inside the `erDiagram` block** (breaks Word and some Mermaid parsers).

**Word export:** [mermaid.live](https://mermaid.live) → paste `folio-full.mmd` → **Actions → PNG/SVG** → insert in Word on a **landscape** section; set picture width to page width (~24–26 cm). Tighter gaps: lower `er.nodeSpacing` / `er.rankSpacing` in the init line; larger text: raise `er.fontSize`.

Render: [mermaid.live](https://mermaid.live) or a Mermaid preview in the editor.

**Mermaid rules:** `type name [PK|FK|UK]` only — no commas, no quoted `"nullable"`, use `datetime` / `json` / `string` (not `timestamptz` / `jsonb` / `enum`).
