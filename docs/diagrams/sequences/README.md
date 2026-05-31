# Folio sequence diagrams (PlantUML)

Interaction flows for the thesis / system design chapter. Pair with use cases in [`../use-cases/`](../use-cases/).

## Render

Same as use-case diagrams: [PlantUML online](https://www.plantuml.com/plantuml/uml/) or the PlantUML VS Code extension.

## Diagrams

| Diagram | File | Use case |
|---------|------|----------|
| Author submit | [`submit-to-journal.puml`](./submit-to-journal.puml) | UC-01 |
| Assign reviewer | [`assign-reviewer.puml`](./assign-reviewer.puml) | UC-02 |
| Accept invitation | [`accept-review-invitation.puml`](./accept-review-invitation.puml) | UC-03 |
| Submit review | [`submit-peer-review.puml`](./submit-peer-review.puml) | UC-04 |

Read peer-review sequences **in order** (UC-02 → UC-03 → UC-04); each diagram is one interaction, not the full lifecycle on one page.

Optional later: copyedit → publish → public catalog (UC-07, UC-08).
