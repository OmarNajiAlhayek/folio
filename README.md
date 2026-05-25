# Folio — peer review workspace

Scholarly **manuscript submission and peer-review** workflow (OJS-inspired concepts, original implementation). Stack: **Next.js** (frontend) + **NestJS** (backend) + **PostgreSQL**.

**Recommended repository folder name:** `folio-peer-review`. If your directory is still named differently, rename it when no editor has the folder open (Windows may lock the path while Cursor/VS Code is using it).

See [`docs/PROJECT-CONTEXT.md`](docs/PROJECT-CONTEXT.md) for product goals, stack notes, and optional OJS reference path.

## Documentation

| Document | Purpose |
|----------|---------|
| [`docs/PROJECT-CONTEXT.md`](docs/PROJECT-CONTEXT.md) | Product context, stack, MVP summary |
| [`docs/feature-report.md`](docs/feature-report.md) | Features and workflows by role |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Entities, submission lifecycle, ERD |
| [`docs/API-NOTES.md`](docs/API-NOTES.md) | REST contract |
| [`docs/PREP-STEPS.md`](docs/PREP-STEPS.md) | Checklist and tooling |

## Folder layout

| Path | Purpose |
|------|---------|
| `frontend/` | Next.js app (Folio UI) |
| `backend/` | NestJS API (`/api/v1/...`) |
| `services/email-service/` | NestJS standalone email microservice (RabbitMQ consumer, scheduled reminders) |
| `packages/shared/` | Canonical event contracts + small messaging helpers (mirrored into each app) |
| `docs/` | Specs |
| `uploads/` | Created at runtime for manuscript files (gitignored at repo root) |

### Shared messaging contracts

Event types, RabbitMQ topology, idempotency keys, and the log redactor are authored under **`packages/shared/`** and copied into `backend/` and `services/email-service/` (Nest `tsc` layout). After editing shared code:

```bash
# from repository root
npm run sync:shared    # copy canonical → mirrors
npm run check:shared   # fail if mirrors drift (CI-friendly)
```

See [`packages/shared/README.md`](packages/shared/README.md).

**Email ops (RabbitMQ, grants, outbox repair, manual E2E):** [`docs/testing-email-pipeline.md`](docs/testing-email-pipeline.md) — operator runbooks, `grant-email-reminder-admin.sql`, and opt-in `npm run test:pipeline` for assign → outbox → queue.

## Prerequisites

- Node.js LTS
- PostgreSQL (local). Create a database, e.g. `CREATE DATABASE folio_review;`
- Docker (only when running the email-service via the bundled compose file)

## Configuration

1. **Backend:** copy [`backend/.env.example`](backend/.env.example) to `backend/.env` and set `DB_*`, `JWT_SECRET`, optional `FRONTEND_ORIGIN` (default `http://localhost:5240`), plus the RabbitMQ + `APP_BASE_URL` block (used to publish reviewer-invite events to the email-service). Do **not** put `SMTP_*` or `EMAIL_PROVIDER` here — mail is configured only in the email-service. OpenAPI is on by default in non-production; set `SWAGGER_ENABLED=true` to expose it when `NODE_ENV=production`.
2. **Frontend:** copy [`frontend/.env.local.example`](frontend/.env.local.example) to `frontend/.env.local`. Leave `NEXT_PUBLIC_API_URL` empty so the browser calls same-origin `/api/v1` (Next.js rewrites to the API on `API_PROXY_TARGET`, default `http://127.0.0.1:5243`). A direct `NEXT_PUBLIC_API_URL=http://localhost:5243` breaks httpOnly cookie auth and is blocked by CSP (`connect-src 'self'`).
3. **Email service:** copy [`services/email-service/.env.example`](services/email-service/.env.example) to `services/email-service/.env`. Default `EMAIL_PROVIDER=noop` logs would-be sends and requires no SMTP server.

**Production:** both apps refuse example `DB_PASSWORD` / weak `JWT_SECRET` (backend) and `guest:guest` RabbitMQ when `NODE_ENV=production`. Generate secrets before deploy; see [`docs/PREP-STEPS.md`](docs/PREP-STEPS.md).

## Run locally

**Terminal 0 — RabbitMQ (only when running the email-service)**

```bash
docker compose -f docker-compose.dev.yml up -d
```

Management UI: `http://localhost:15672` (guest/guest).

**Terminal 1 — API**

```bash
cd backend
npm install
npm run seed
npm run start:dev
```

Health check: `http://localhost:5243/api/v1/health`. Outbox stats: `http://localhost:5243/api/v1/health/outbox`.

API docs (Swagger UI): `http://localhost:5243/api-docs` — OpenAPI JSON for import/codegen: `http://localhost:5243/api-docs-json`

**Terminal 2 — Web**

```bash
cd frontend
npm install
npm run dev
```

App: `http://localhost:5240`

**Terminal 3 — Email service** (optional in dev; required for reviewer-invite emails)

```bash
cd services/email-service
npm install
npm run start:dev
```

The service connects to RabbitMQ, runs its own migrations into a dedicated `email` schema in the same Postgres database, and starts consuming `reviewer.invited` and `reminder.due` events. With `EMAIL_PROVIDER=noop` (default) it logs each would-be send instead of contacting an SMTP host. See [`docs/plans/email-service.md`](docs/plans/email-service.md) for the full design.

### Sample accounts (after `npm run seed` in `backend/`)

| Email | Password | Roles |
|--------|----------|--------|
| `manager@folio.local` | `Manager123!` | Author, journal manager (users, email admin, queue oversight) |
| `editor@folio.local` | `Editor123!` | Author, editor, reviewer (handling editor — decisions, assignments) |
| `reviewer@folio.local` | `Reviewer123!` | Author, reviewer |
| `author@folio.local` | `Author123!` | Author |
| `copyeditor@folio.local` | `Copyeditor123!` | Author, copyeditor |

### Copyediting (production queries)

After **accepted**, an editor assigns one or more **copyeditors** (`POST /api/v1/submissions/:slug/copyedit-assignments`). The submission moves to **`copyediting`**. Copyeditors send **rounds** of author-facing queries (`POST /api/v1/copyedit-assignments/:assignmentSlug/notes`); the author is emailed, uploads a revised **manuscript** file, then marks that assignment ready (`POST /api/v1/copyedit-assignments/:assignmentSlug/ready`). When every assignment is **ready for review**, a copyeditor may **publish** (`POST /api/v1/submissions/:slug/publish`). UI: **Copyediting** nav (copyeditor queue) and a copyedit panel on the submission detail page.

Email templates (admin): `copyedit-assigned`, `copyedit-queries-sent`, `copyedit-author-ready`.

New self-registered users are **authors** with a researcher profile (affiliation, optional ORCID, review interests). **Reviewer** and **copyeditor** can be assigned by a **journal manager** (`users.manage_roles`) via `PATCH /api/v1/users/:id/roles`. **Editor** and **journal manager** roles require an in-app invitation:

- `POST /api/v1/users/:id/role-invitations` with body `{ "roleSlug": "editor" }` or `{ "roleSlug": "journal_manager" }` (inviter must have `users.manage_roles`).
- Invitee sees the pending invite on the **Dashboard** and calls `POST /api/v1/role-invitations/:invitationId/accept` or `.../decline`.
- `PATCH .../roles` **rejects** payloads that newly add `editor` or `journal_manager` without going through this flow.

**Journal manager** handles user onboarding, email templates/reminder policy, and can browse the editor queue. **Editor** (handling editor) makes workflow decisions, assigns reviewers/copyeditors, and receives new-submission notifications. Seeded accounts get roles directly from the seed script, not via invitations.

To reset only seeded sample submissions before re-seeding: `npm run seed:reset` (sets `SEED_RESET_SAMPLE=1`; legacy `SEED_RESET_DEMO=1` is still accepted).

## API surface

Global prefix: **`/api/v1`**. Auth: **Bearer JWT** from `POST /auth/register` or `POST /auth/login`.

Public catalog: `GET /api/v1/public/submissions` (no auth).

## Reviewer pool

Users with the **reviewer** role appear in the editor’s assign-reviewer list only if **`willingToReview`** is true on their profile (typical of editorial-manager style systems). Self-registration can set that flag; editors still assign manuscripts—reviewers do not pick papers from a public queue.

## Word Constructor (in-app document builder)

Authors who do not have a `.docx` ready can build their manuscript section by section in the **Word Constructor** instead of uploading a file. The flow is:

1. From `/submissions/new`, pick *Use Word Constructor* in the mode selector.
2. The pre-slug compose flow (`/submissions/compose/create`) saves to `localStorage` and syncs across tabs via `BroadcastChannel`. Continue to **New submission** to create a server record (legacy `/submissions/constructor/*` redirects here).
3. The post-slug compose page (`/submissions/[slug]/compose`) auto-saves every 1.5 s, generates a styled `.docx` via the backend, and attaches it from the submission detail page (submit for review uses the same `/submissions/:slug/submit` endpoint as upload mode).

**Section kinds (v2):** mandatory bilingual titles, authors, abstracts, and references; optional IMRaD structure presets (tracked via `presetSourceId`); headings, paragraphs, figures, tables (with optional table notes), four back-matter rich-text blocks (acknowledgments, funding, conflict of interest, data availability), and LaTeX equations (rendered to PNG in `.docx` — not editable OMML formulas). Docx import maps headings heuristically and emits stable warning codes when attribution is uncertain.

**Backend equation rendering** uses the same **KaTeX** output as the constructor preview, rasterized to PNG via **Playwright** (Edge/Chrome on Windows, bundled Chromium elsewhere). Falls back to MathJax + `sharp` when Playwright is unavailable. Equations in Word are embedded images (not editable OMML). For local dev on Windows, Edge or Chrome is used automatically; elsewhere run `npx playwright install chromium` in `backend/` if needed.

Generated `.docx` files apply curated **publication styles** from [`backend/src/manuscript-styles`](backend/src/manuscript-styles) (API: `GET /api/v1/public/manuscript-styles`). The Damascus profile matches [docs/styles/damascus-university-journal-v1.md](docs/styles/damascus-university-journal-v1.md) (Simplified Arabic 12 pt for RTL, Times New Roman 11 pt for LTR, headings, figure/table captions, RTL-aware paragraphs).

### Architecture

| Layer | File / module | Notes |
|-------|---------------|-------|
| Types (frontend mirror) | [`frontend/src/lib/constructor-content.types.ts`](frontend/src/lib/constructor-content.types.ts) | Shape of `ConstructorContent`, sections, refs, validation errors |
| Types (backend) | [`backend/src/submissions/constructor-content.types.ts`](backend/src/submissions/constructor-content.types.ts) | Source of truth — keep frontend mirror in sync |
| Validation (shared shape) | [`backend/src/submissions/constructor-content-utils.ts`](backend/src/submissions/constructor-content-utils.ts), [`frontend/src/lib/constructor-validation.ts`](frontend/src/lib/constructor-validation.ts) | Both return `{ code, message, sectionId? }[]` |
| `.docx` generation | [`backend/src/submissions/docx-generator.service.ts`](backend/src/submissions/docx-generator.service.ts) | Uses `docx`, `parse5`, `sanitize-html` |
| API endpoints | [`backend/src/submissions/submissions.controller.ts`](backend/src/submissions/submissions.controller.ts) | `PATCH /submissions/:slug` accepts `constructorContent`, `POST /submissions/:slug/generate-docx` returns or attaches the `.docx` |
| Editor UI | [`frontend/src/components/constructor/`](frontend/src/components/constructor/) | `SectionEditors`, `LivePreview`, `SectionList`, `ValidationBanner`, `ModeSelector`, `ConstructorWorkspace` |
| Pages | [`frontend/src/app/[locale]/submissions/compose/create/page.tsx`](frontend/src/app/%5Blocale%5D/submissions/compose/create/page.tsx), [`frontend/src/app/[locale]/submissions/[slug]/compose/page.tsx`](frontend/src/app/%5Blocale%5D/submissions/%5Bslug%5D/compose/page.tsx) | Pre-slug + post-slug compose routes |
| IMRaD presets | [`frontend/src/lib/constructor-section-presets.ts`](frontend/src/lib/constructor-section-presets.ts) | Preset bundles + `articleType` matrix for the add picker |
| Plan / decisions | [`docs/plans/word-constructor.md`](docs/plans/word-constructor.md) | Full design rationale & v1 limitations |

### Adding a new section kind

1. Extend `ConstructorSectionKind` in **both** type files (frontend + backend) and add a section interface.
2. Update `ConstructorSection` union and `createBlankSection` in [`SectionEditors.tsx`](frontend/src/components/constructor/SectionEditors.tsx).
3. Add an editor branch in `SectionEditor` and a preview branch in `LivePreview`.
4. Add a `build*` method in `DocxGeneratorService` and register it in the section dispatcher.
5. If the new kind references uploaded files, extend `collectReferencedFileIds` in [`constructor-content-utils.ts`](backend/src/submissions/constructor-content-utils.ts) so orphan cleanup keeps working.
6. Add translation keys under `ConstructorList.kind_*` and any editor-specific labels under `ConstructorEditor.*` in `messages/en.json` + `messages/ar.json`.

### v1 limitations (deliberately deferred)

- **Footnotes / endnotes:** Not yet supported. Planned for v2.
- **Merged table cells:** Tables are flat string grids with an optional header row. No `rowspan`/`colspan` in v1 — see plan for migration path.
- **Reverse-engineering uploaded `.docx` files into structured content:** Out of scope. A submission is either upload-mode or constructor-mode, not both. Switching modes after content exists is gated behind an explicit "Switch mode" action with cleanup confirmation.
- **Inline images inside paragraphs:** TipTap's image extension is intentionally disabled. Use a dedicated `image` section instead — this keeps `localStorage` light and avoids base64 bloat.
- **Bidirectional fine-grained marks:** Direction is per-section. Mixing LTR/RTL within a single paragraph relies on the renderer's bidi algorithm; explicit `<bdi>` wrappers are not surfaced in the toolbar.
- **Live collaborative editing:** Multi-tab sync via `BroadcastChannel` covers same-user, same-browser drafts only. Two browsers / two devices remain last-write-wins by autosave.

## Playwright E2E (Word Constructor)

The Word Constructor E2E plan is tracked in [`docs/plans/playwright-constructor-e2e.md`](docs/plans/playwright-constructor-e2e.md).

### Run locally

From `frontend/`:

```bash
npm install
npm run e2e:install
npm run test:e2e
```

Playwright starts both backend and frontend using `webServer` entries in [`frontend/playwright.config.ts`](frontend/playwright.config.ts).

### Coverage currently automated

- Mode routing and sticky upload mode
- Pre-slug to post-slug draft transition + persistence across refresh
- Submission detail inline gating behavior
- Validation banner rendering for structured backend errors (with jump-to-section)
- DOCX generate flow smoke (status, MIME type, non-trivial payload)
- RTL preview smoke using typed Arabic paragraph content

### Notes

- Worker users are deterministic (`e2e-worker-{index}@test.local`) and created idempotently during global setup.
- The autosave helper waits for a successful `PATCH /submissions/:slug` (`status=200`) instead of time-based sleeps.
