# Folio use case diagrams (PlantUML)

Text-based UML use case diagrams with stick-figure actors, `<<include>>`, and `<<extend>>`.

## Render

1. Paste a `.puml` file into [PlantUML online server](https://www.plantuml.com/plantuml/uml/).
2. Or install the **PlantUML** extension in Cursor/VS Code (Java or remote render server).

Export PNG/SVG for docs or slides.

## Diagrams

| Role | File | Scope |
|------|------|--------|
| Journal manager | [`journal-manager.puml`](./journal-manager.puml) | **JM-only**: `users.manage_roles`, `email.manage_reminders` |
| Editor | [`editor.puml`](./editor.puml) | Editorial workflow, peer review, copyeditor handoff, assignment reminders |
| Author | [`author.puml`](./author.puml) | **Author-only**: `submission.manage_own`; **AI**: suggest discipline, keyword suggestions |
| Reviewer | [`reviewer.puml`](./reviewer.puml) | **Reviewer-only**: accept/decline invite, read manuscript, submit review |
| Copyeditor | [`copyeditor.puml`](./copyeditor.puml) | **Copyeditor-only**: copyedit queue, queries to author, publish |
| Reader (public) | [`reader.puml`](./reader.puml) | Published catalog (unauthenticated); **AI**: semantic search, related articles |

Source of truth for staff roles: `backend/src/rbac/rbac.service.ts` (`journalManagerPerms` vs `editorPerms`). **Reader is not an RBAC role** — see `backend/src/public/public-submissions.controller.ts` and [`docs/feature-report.md`](../../feature-report.md) (Reader / public catalog).

Capabilities both roles share (e.g. editor queue, per-assignment reminders) are documented on the editor diagram, not duplicated here.
