# Project context

Folio is a **manuscript submission and peer-review** workspace: editors manage a queue, assign reviewers, and move submissions through a defined lifecycle; authors and reviewers act through role-based permissions. The stack is **Next.js** (UI), **NestJS** (HTTP API), **PostgreSQL**, optional **RabbitMQ** + **`services/email-service`** for outbound mail without blocking the API.

## Scope (MVP)

- Roles: author, editor, reviewer (users may hold multiple roles).
- Submissions with structured metadata, files, status transitions, assignments, and reviews.
- Role-based features and workflows: [`feature-report.md`](./feature-report.md).

## Data and API

- Entities and lifecycle: [`DATA-MODEL.md`](./DATA-MODEL.md).
- REST contract (`/api/v1/...`): [`API-NOTES.md`](./API-NOTES.md).

## Email pipeline

The core API records facts and publishes events; the standalone email service consumes messages and sends mail (see repo [`README.md`](../README.md) and [`testing-email-pipeline.md`](./testing-email-pipeline.md)).

## Optional reference

OJS may be used **only** as a conceptual reference for workflow vocabulary—not as code or UX to copy. Academic honesty: cite references appropriately when borrowing ideas.
