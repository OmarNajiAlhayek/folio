# Damascus University Journal class diagrams (TypeORM domain model)

UML class diagrams for **`backend/src/entities/`** (NestJS + TypeORM). Property names match TypeScript entities; table names are in notes where they differ.

| Diagram | File | Classes |
|---------|------|---------|
| Identity & RBAC | [`01-identity-rbac.puml`](./01-identity-rbac.puml) | `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `RoleInvitation` |
| Manuscripts | [`02-manuscripts.puml`](./02-manuscripts.puml) | `User`, `Submission`, `SubmissionFile`, enums |
| Peer review | [`03-peer-review.puml`](./03-peer-review.puml) | `User`, `Submission`, `ReviewAssignment`, `Review`, enums |
| Copyediting | [`04-copyedit.puml`](./04-copyedit.puml) | `User`, `Submission`, `CopyeditAssignment`, `CopyeditNote` |
| Inbox & auth | [`05-inbox-auth.puml`](./05-inbox-auth.puml) | `User`, `Notification`, `RevokedToken` |
| Email & events | [`06-email-events.puml`](./06-email-events.puml) | `OutboundEvent`, email-service entities |
| **Overview** | [`folio-overview.puml`](./folio-overview.puml) | All backend entities, links only (PlantUML) |
| **Overview (Mermaid)** | [`folio-overview.mmd`](./folio-overview.mmd) | **Compact** — 8 core classes with key attributes, fits Word/PNG export |

**By role:** [`../class-by-role/README.md`](../class-by-role/README.md) · **ER diagrams:** [`../erd/README.md`](../erd/README.md) · **ER by role:** [`../erd-by-role/README.md`](../erd-by-role/README.md)

Render: [PlantUML online](https://www.plantuml.com/plantuml) · VS Code PlantUML extension · same as [`../use-cases/`](../use-cases/).
