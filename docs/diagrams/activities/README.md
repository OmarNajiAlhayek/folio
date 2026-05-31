# Folio activity diagrams (PlantUML)

Workflow views for the thesis (Chapter 4 / 5). Complements sequence diagrams in [`../sequences/`](../sequences/) and use cases in [`../use-cases/`](../use-cases/).

## Render

[PlantUML online](https://www.plantuml.com/plantuml/uml/) or the PlantUML VS Code extension → export PNG/SVG.

## Diagrams

| Diagram | File | Use case |
|---------|------|----------|
| Author submit | [`submit-to-journal.puml`](./submit-to-journal.puml) | UC-01 |
| Assign reviewer | [`assign-reviewer.puml`](./assign-reviewer.puml) | UC-02 |
| Accept invitation | [`accept-review-invitation.puml`](./accept-review-invitation.puml) | UC-03 |
| Submit review | [`submit-peer-review.puml`](./submit-peer-review.puml) | UC-04 |

Read peer-review activities **in order** (UC-02 → UC-03 → UC-04). Sequence-level detail: [`../sequences/`](../sequences/).
