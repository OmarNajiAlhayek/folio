# Folio — peer review workspace

Scholarly **manuscript submission and peer-review** workflow (OJS-inspired concepts, original implementation). Stack: **Next.js** (frontend) + **NestJS** (backend) + **PostgreSQL**.

**Recommended repository folder name:** `folio-peer-review`. If your directory is still named differently, rename it when no editor has the folder open (Windows may lock the path while Cursor/VS Code is using it).

See [`docs/PROJECT-CONTEXT.md`](docs/PROJECT-CONTEXT.md) for product goals, stack notes, and optional OJS reference path.

## Documentation

| Document | Purpose |
|----------|---------|
| [`docs/README.md`](docs/README.md) | Documentation index |
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
| `services/ai-service/` | Python FastAPI + gRPC AI microservice (classifier, keywords, similarity, plagiarism, reviewer matching, copyedit reference check) |
| `proto/` | Buf protobuf contracts between Nest and ai-service |
| `packages/shared/` | `@folio/shared` workspace package — event contracts + messaging helpers |
| `docs/` | Specs |
| `uploads/` | Created at runtime for manuscript files (gitignored at repo root) |

### Shared messaging contracts

Event types, RabbitMQ topology, idempotency keys, and the log redactor live in the **`@folio/shared`** package (`packages/shared/`). Both Nest apps import it directly — no file copies. After editing shared code:

```bash
# from repository root
npm run build:shared
```

See [`packages/shared/README.md`](packages/shared/README.md).

### Git hooks

Root `npm install` enables **Husky** pre-commit hooks that run **lint-staged** (Prettier + ESLint on staged TypeScript). Install once from the repo root:

```bash
npm install
```

**Email ops (RabbitMQ, outbox repair, manual E2E):** [`docs/testing-email-pipeline.md`](docs/testing-email-pipeline.md) — operator runbooks and opt-in `npm run test:pipeline` for assign → outbox → queue.

**Performance / load tests:** [`docs/testing-performance.md`](docs/testing-performance.md) — `npm run test:perf` (k6 + gRPC benchmarks; weekly GitHub Actions workflow).

## Prerequisites

- Node.js LTS
- PostgreSQL (local or via Docker). Create a database, e.g. `CREATE DATABASE folio_review;`
- Docker (optional; `docker-compose.dev.yml` covers all infrastructure dependencies)
- Python 3.12+ (only when running the ai-service)

## Configuration

1. **Backend:** copy [`backend/.env.example`](backend/.env.example) to `backend/.env` and set `DB_*`, `JWT_SECRET`, optional `FRONTEND_ORIGIN` (default `http://localhost:5240`), plus the RabbitMQ + `APP_BASE_URL` block. Do **not** put `SMTP_*` or `EMAIL_PROVIDER` here — mail is configured only in the email-service. OpenAPI is on by default in non-production; set `SWAGGER_ENABLED=true` to expose it when `NODE_ENV=production`. Notable optional vars: `TYPESENSE_ENABLED` + `TYPESENSE_*` (publication search), `ORCID_ENABLED` + `ORCID_*` (Sign in with ORCID), `AUDIT_SAMPLE_RATE` (request audit log sampling, default 1.0).
2. **Frontend:** copy [`frontend/.env.local.example`](frontend/.env.local.example) to `frontend/.env.local`. Leave `NEXT_PUBLIC_API_URL` empty so the browser calls same-origin `/api/v1` (Next.js rewrites to the API on `API_PROXY_TARGET`, default `http://127.0.0.1:5243`). A direct `NEXT_PUBLIC_API_URL=http://localhost:5243` breaks httpOnly cookie auth and is blocked by CSP (`connect-src 'self'`).
3. **Email service:** copy [`services/email-service/.env.example`](services/email-service/.env.example) to `services/email-service/.env`. Default `EMAIL_PROVIDER=noop` logs would-be sends and requires no SMTP server.
4. **AI service** (optional): copy [`services/ai-service/.env.example`](services/ai-service/.env.example) to `services/ai-service/.env`. Enable features per flag (see Terminal 4). Mirror toggles in [`backend/.env.example`](backend/.env.example): `AI_SERVICE_ENABLED`, `AI_SIMILARITY_ENABLED`, `AI_KEYWORDS_ENABLED`, `AI_REVIEWER_MATCHING_ENABLED`, `AI_COPYEDIT_ENABLED`. For copyedit grammar checks, set `LANGUAGE_TOOL_ENABLED=true` and start LanguageTool via Docker (see below).

**Production:** both apps refuse example `DB_PASSWORD` / weak `JWT_SECRET` (backend) and `guest:guest` RabbitMQ when `NODE_ENV=production`. Generate secrets before deploy; see [`docs/PREP-STEPS.md`](docs/PREP-STEPS.md).

## Run locally

**Terminal 0 — Docker (optional infrastructure)**

```bash
docker compose -f docker-compose.dev.yml up -d
```

`docker-compose.dev.yml` provides five named services — start all or individually:

| Service | Port(s) | Purpose |
|---------|---------|---------|
| `postgres` | host **5434** → container 5432 | Main app DB (`folio_review`); `pgvector/pgvector:pg17` |
| `postgres-email` | host **5433** → container 5432 | Email service DB (`folio_email`) |
| `rabbitmq` | AMQP **5672**, management UI **15672** (guest/guest) | Event bus for email pipeline |
| `languagetool` | **8010** | Copyedit grammar/spelling; set `LANGUAGE_TOOL_ENABLED=true` |
| `typesense` | **8108** | Full-text search engine; set `TYPESENSE_ENABLED=true` |

Start a single service: `docker compose -f docker-compose.dev.yml up -d typesense`. Note the API default in `backend/.env.example` uses `DB_PORT=5434` to match.

**Alternative: full-stack in Docker** — `docker compose -f docker-compose.local.yml up` runs infra + all app services together. Do **not** run both compose files simultaneously (they share ports).

**Terminal 1 — API**

```bash
cd backend
npm install
npm run migrate    # apply TypeORM migrations (also runs on API startup by default)
npm run seed
npm run start:dev
```

Migrations replace `synchronize: true` for schema management. Set `DB_SYNCHRONIZE=true` in `.env` only for quick local experiments.

**Existing local DB** created with the old auto-sync? Either run `npm run seed:fresh` after migrations, or baseline the migration history if the schema already matches:

```sql
INSERT INTO migrations (timestamp, name) VALUES (1781093303431, 'Init1781093303431');
```

`npm run seed` also applies the publication catalog search schema (FTS + `pg_trgm` on `submissions`). For a DB you seeded before that step existed, run `npm run db:publication-search` once.

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

The service connects to its own Postgres database (`folio_email` on port **5433** via `docker-compose.dev.yml`), runs migrations into schema `email`, exposes an internal HTTP API on port **5244** for admin operations (proxied by the Nest backend), and consumes `reviewer.invited` and `reminder.due` events from RabbitMQ. With `EMAIL_PROVIDER=noop` (default) it logs each would-be send instead of contacting an SMTP host. See [`services/email-service/README.md`](services/email-service/README.md) and [`docs/plans/email-service.md`](docs/plans/email-service.md).

**Terminal 4 — AI service** (optional; required for AI-assisted UI features)

```bash
cd services/ai-service
cp .env.example .env
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
# Optional extras: pip install -e ".[dev,ml]" (AraBERT), pip install -e ".[dev,similarity]" (pgvector)
uvicorn app.main:app --reload --port 5245
```

- **HTTP (5245):** liveness/readiness only — `http://localhost:5245/health`, `http://localhost:5245/ready`
- **gRPC (5246):** product RPCs consumed by Nest (`ClassifierService`, `KeywordService`, `PlagiarismService`, `SimilarityService`, `ReviewerMatchingService`, `CopyeditService`). See [`proto/README.md`](proto/README.md).

In **`backend/.env`**, set `AI_SERVICE_ENABLED=true` and `AI_SERVICE_GRPC_HOST=127.0.0.1`, then enable feature flags as needed:

| Backend flag | ai-service flags | Feature |
|--------------|------------------|---------|
| `AI_SERVICE_ENABLED` | `ARABERT_ENABLED=true` (+ `.[ml]` weights) | Arabic discipline classify on submit / suggest |
| `AI_KEYWORDS_ENABLED` | `KEYWORDS_SUGGESTION_ENABLED=true`, `AI_PROVIDER=openai` | Author keyword suggestions |
| `AI_SIMILARITY_ENABLED` | `SIMILARITY_ENABLED=true` (+ `.[similarity]`) | Related articles, semantic catalog search, corpus similarity |
| `AI_REVIEWER_MATCHING_ENABLED` | `REVIEWER_MATCHING_ENABLED=true`, `SIMILARITY_ENABLED=true` | Editor suggested reviewers |
| `AI_COPYEDIT_ENABLED` | `COPYEDIT_ANALYSIS_ENABLED=true`, `AI_PROVIDER=openai` | Copyeditor reference cross-checking (LLM) |
| `LANGUAGE_TOOL_ENABLED` | LanguageTool container on `8010` (Nest HTTP, not gRPC) | Copyeditor grammar/spelling suggestions |

**Typesense publication search** is independent of ai-service. Enable with `TYPESENSE_ENABLED=true` + Typesense running on port `8108` (see `docker-compose.dev.yml`). The backend syncs published submissions automatically every 5 minutes and on publish. Editors can trigger a full reindex via `POST /api/v1/editor/search/reindex` (journal manager permission) and manage search overrides/synonyms via the `/editor/search/` curation API.

Default `AI_PROVIDER=noop` needs no API keys for health/gRPC startup. Full runbook: [`services/ai-service/README.md`](services/ai-service/README.md), design: [`docs/plans/ai-service.md`](docs/plans/ai-service.md).

### Sample accounts (after `npm run seed` in `backend/`)

| Email | Password | Roles |
|--------|----------|--------|
| `author@folio.local` | `Author123!` | Author (own manuscripts, new draft) |
| `manager@folio.local` | `Manager123!` | Journal manager (users, email admin, queue oversight) |
| `editor@folio.local` | `Editor123!` | Editor, reviewer (handling editor — decisions, assignments) |
| `reviewer@folio.local` | `Reviewer123!` | Reviewer |
| `copyeditor@folio.local` | `Copyeditor123!` | Copyeditor |

### Copyediting (production queries)

After **accepted**, an editor assigns one or more **copyeditors** (`POST /api/v1/submissions/:slug/copyedit-assignments`). The submission moves to **`copyediting`**. Copyeditors send **rounds** of author-facing queries (`POST /api/v1/copyedit-assignments/:assignmentSlug/notes`); the author is emailed, uploads a revised **manuscript** file, then marks that assignment ready (`POST /api/v1/copyedit-assignments/:assignmentSlug/ready`). When every assignment is **ready for review**, a copyeditor may **publish** (`POST /api/v1/submissions/:slug/publish`). UI: **Copyediting** nav (copyeditor queue) and a copyedit panel on the submission detail page.

Email templates (admin): `copyedit-assigned`, `copyedit-queries-sent`, `copyedit-author-ready`.

**Copyedit AI analysis (optional):** On the copyedit workbench, `POST /api/v1/copyedit-assignments/:assignmentSlug/ai-analysis` runs three checks on constructor content: (1) Damascus journal format rules (always, no external service), (2) grammar/spelling via **LanguageTool** when `LANGUAGE_TOOL_ENABLED=true`, (3) inline-citation vs reference-list cross-check via **CopyeditService** gRPC when `AI_COPYEDIT_ENABLED=true`. Returns `{ formatIssues, grammarNotes, referenceIssues, aiUnavailable }`. Disabled services yield empty arrays (grammar) or `aiUnavailable: true` (references).

New self-registered users are **authors** with a researcher profile (affiliation, optional ORCID, review interests). **Reviewer** and **copyeditor** can be assigned by a **journal manager** (`users.manage_roles`) via `PATCH /api/v1/users/:id/roles`. **Editor** and **journal manager** roles require an in-app invitation:

- `POST /api/v1/users/:id/role-invitations` with body `{ "roleSlug": "editor" }` or `{ "roleSlug": "journal_manager" }` (inviter must have `users.manage_roles`).
- Invitee sees the pending invite on the **Dashboard** and calls `POST /api/v1/role-invitations/:invitationId/accept` or `.../decline`.
- `PATCH .../roles` **rejects** payloads that newly add `editor` or `journal_manager` without going through this flow.

**Journal manager** handles user onboarding (UI: `/journal-manager/users` — search users, grant reviewer/copyeditor, invite editor/journal manager), email templates/reminder policy (`/journal-manager/email-settings`), and can browse the editor queue. **Editor** (handling editor) makes workflow decisions, assigns reviewers/copyeditors, and receives new-submission notifications. Seeded accounts get roles directly from the seed script, not via invitations.

To wipe **everything** in the app DB and uploads, then re-seed (dev): `npm run seed:fresh` (`SEED_RESET_ALL=1`). To reset only `[SAMPLE]` / legacy `[DEMO]` submissions: `npm run seed:reset` (`SEED_RESET_SAMPLE=1`; legacy `SEED_RESET_DEMO=1` is still accepted).

## API surface

Global prefix: **`/api/v1`**. Auth: **Bearer JWT** from `POST /auth/register` or `POST /auth/login`. ORCID OAuth: `GET /auth/orcid` (enabled via `ORCID_ENABLED=true` in `backend/.env`).

Public catalog: `GET /api/v1/public/submissions` (no auth).

**Audit log:** Every non-health API request is logged to `audit_log` (sampled by `AUDIT_SAMPLE_RATE`, default 1.0). Journal managers with `audit.log.view` permission can query at `GET /api/v1/audit/logs` (filters: userId, startDate, endDate, method, routePattern, actionType, resourceType, resourceId; paginated). Sensitive fields (passwords, tokens, OTPs) are redacted from stored request bodies.

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
