# Contributing

How work moves through this repository. Setup lives in
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md); the system design is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Before your first change

```bash
npm install            # repository root — installs the Husky pre-commit hook
npm run build:shared   # compile @folio/shared, which both Nest apps consume
```

The pre-commit hook runs Prettier and ESLint on staged files only. Do not bypass it with
`--no-verify`; if it fails, fix the cause.

---

## Branches and commits

Branch off `main`. Name branches after the work: `feat/reviewer-matching`,
`fix/outbox-retry`, `docs/deployment`.

Commit messages follow **Conventional Commits**, which is what the existing history uses:

```
feat(plagiarism): add exact-overlap stage backed by a fingerprint corpus
fix(auth): reject refresh tokens after role revocation
docs(deployment): document the container build contexts
chore: ignore local-only DOCX import integration spec
```

Types in use: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`. The scope is the
component or domain (`backend`, `frontend`, `plagiarism`, `email`, …) and is optional.

Write the subject as the change, not the activity: "add exact-overlap stage", not "worked on
plagiarism".

---

## What a change should include

| Change | Also required |
|--------|---------------|
| New or altered database column | A TypeORM migration (`npm run migrate:generate`). Never `synchronize` |
| New event or routing key | Contract + idempotency key in `packages/shared`, consumed by both sides |
| `.proto` edit | `npm run proto:lint && npm run proto:gen`, and commit the regenerated stubs |
| New environment variable | An entry in the matching `.env.example`, in `docker/.env.example` if the stack needs it, and a row in [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) |
| New API endpoint | Swagger decorators, plus [`docs/API-NOTES.md`](docs/API-NOTES.md) when the contract shape changes |
| New UI string | Keys in **both** `messages/en.json` and `messages/ar.json` |
| New optional capability | A feature flag that is **off** by default, and a documented pairing if a second service must agree |

CI fails when generated protobuf stubs are stale, so regenerating is not optional.

---

## Code conventions

**Shared contracts, never copies.** Anything both Nest apps must agree on — event payloads,
routing keys, idempotency keys, redaction rules — belongs in `packages/shared`. Rebuild it after
editing (`npm run build:shared`); the apps import compiled output.

**RTL is a first-class requirement.** Use logical CSS properties (`ps-*`, `pe-*`, `ms-*`,
`me-*`, `start-*`, `end-*`) instead of left/right. Tailwind v4 is configured with tokens in
`globals.css` under `@theme inline` — there is no `tailwind.config.js`.

**Feature flags default to off.** A fresh checkout must run without AI services, LanguageTool,
Typesense or SMTP.

**Failures degrade, they do not block.** An unavailable AI service must never prevent a
submission; deadline it and return "unavailable".

**Secrets never enter the repository.** `.env` files are gitignored; `.env.example` files carry
placeholders and comments only.

**Match the surrounding code.** Naming, comment density and structure should look like the file
you are editing.

---

## Tests

Run what your change touches, at minimum:

```bash
cd backend  && npm test
cd frontend && npm run test:unit
cd services/ai-service && pytest && ruff check app tests
```

Integration suites are opt-in by environment flag because they need a database, a broker or the
Python service — `npm run test:pipeline`, `npm run test:ai-jobs`, `npm run test:query-plans`.
Keep it that way: a plain `npm test` must stay runnable on a laptop with nothing else running.

Full matrix: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md#6-tests).

---

## Pull requests

Before opening one:

- [ ] Relevant tests pass locally
- [ ] Migrations included and applied cleanly against a fresh database
- [ ] Generated protobuf stubs regenerated and committed if `.proto` changed
- [ ] `.env.example`, `docker/.env.example` and `docs/CONFIGURATION.md` updated for new variables
- [ ] Docs updated when behaviour, configuration or architecture changed
- [ ] No secrets, dumps, PDFs or local scratch files in the diff

Describe **what changed and why**, and how you verified it. Note anything intentionally left
out. If a change alters a documented behaviour, the doc update belongs in the same PR — docs
that lag the code stop being trusted.

---

## Documentation

| Doc | Owns |
|-----|------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Components, boundaries, cross-service flows, design decisions |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Local setup, commands, tests, troubleshooting |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Images, compose stack, operations, hardening |
| [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) | Environment variable reference |
| [`docs/PRODUCT-SPECIFICATION.md`](docs/PRODUCT-SPECIFICATION.md) | As-built product behaviour |
| [`docs/plans/`](docs/plans/) | Design records — the reasoning behind a subsystem |
| Component `README.md` | How to run, test and reason about that component |

Add new documents to the index in [`docs/README.md`](docs/README.md), otherwise they will not be
found.
