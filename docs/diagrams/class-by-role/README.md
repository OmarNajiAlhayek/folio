# Damascus University Journal class diagrams by role

TypeORM entities from **`backend/src/entities/`**, grouped by **who primarily reads/writes** them. Classes **repeat** across roles; links show the main workflow, not exclusive access.

| Role | Diagram | Primary classes |
|------|---------|-----------------|
| Author | [`author.puml`](./author.puml) | `User`, `Submission`, `SubmissionFile`, `Notification` |
| Reviewer | [`reviewer.puml`](./reviewer.puml) | `User`, `Submission`, `ReviewAssignment`, `Review`, `SubmissionFile` |
| Editor | [`editor.puml`](./editor.puml) | `Submission`, `SubmissionFile`, `ReviewAssignment`, `Review`, `CopyeditAssignment` |
| Copyeditor | [`copyeditor.puml`](./copyeditor.puml) | `User`, `Submission`, `CopyeditAssignment`, `CopyeditNote` |
| Journal manager | [`journal-manager.puml`](./journal-manager.puml) | `User`, `Role`, `UserRole`, `RoleInvitation`, email config |
| Reader | [`reader.puml`](./reader.puml) | `Submission`, `SubmissionFile` (published / public) |

**One diagram for everything:** [`../class/folio-overview.mmd`](../class/folio-overview.mmd) (Mermaid)

**By domain:** [`../class/README.md`](../class/README.md) · **ER by role:** [`../erd-by-role/README.md`](../erd-by-role/README.md) · **Use cases:** [`../use-cases/`](../use-cases/)

Render: [PlantUML online](https://www.plantuml.com/plantuml) · VS Code PlantUML extension.
