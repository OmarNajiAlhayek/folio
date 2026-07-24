# Damascus University Journal ERD by role

Same database as [`../erd/`](../erd/) (domain slices), organized by **who primarily reads/writes** each table. Tables **repeat** across roles; arrows show the main workflow path, not exclusive access.

| Role | Diagram | Primary tables |
|------|---------|----------------|
| Author | [`author.mmd`](./author.mmd) | `submissions`, `submission_files`, `notifications` |
| Reviewer | [`reviewer.mmd`](./reviewer.mmd) | `review_assignments`, `reviews`, `submission_files` (review stage) |
| Editor | [`editor.mmd`](./editor.mmd) | `submissions`, `submission_files`, `review_assignments`, `reviews`, `copyedit_assignments` |
| Copyeditor | [`copyeditor.mmd`](./copyeditor.mmd) | `copyedit_assignments`, `copyedit_notes`, `submissions` |
| Journal manager | [`journal-manager.mmd`](./journal-manager.mmd) | `users`, `user_roles`, `role_invitations`, email config |
| Reader | [`reader.mmd`](./reader.mmd) | `submissions` (published), `submission_files` (`is_public`) |

**Class diagrams by role:** [`../class-by-role/README.md`](../class-by-role/README.md)  
**Canonical schema & all FK links:** [`../erd/LINKS.md`](../erd/LINKS.md)  
**Use cases (behavior):** [`../use-cases/`](../use-cases/)

Render: [mermaid.live](https://mermaid.live) · Layout: `direction LR` (Mermaid 10.3+).
