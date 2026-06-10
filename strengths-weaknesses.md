# Folio — Strengths & Weaknesses Analysis

## Strengths

### Architecture & Design
- **Well-separated microservices architecture:** NestJS backend (HTTP API), standalone email-service (RabbitMQ consumer + cron), Python ai-service (gRPC). Each has clear boundaries and independent scaling.
- **Transactional outbox pattern:** RabbitMQ events go through `outbound_event_outbox` in the same DB transaction as domain writes — guarantees at-least-once delivery without two-phase commit.
- **Shared canonical contracts:** `packages/shared/` is the single source of truth for event types, routing keys, idempotency builders, and topology — mirrored into consuming apps with a CI drift check.
- **gRPC for AI, HTTP for human-facing APIs:** Smart protocol choice — Nest talks to Python over typed gRPC stubs (Buf-generated), reviewers/editors get standard REST.
- **Protobuf-first AI contracts:** `proto/` directory with Buf linting, breaking-change detection, and committed generated stubs in both TypeScript and Python.
- **Feature flags everywhere:** Every AI capability is independently toggleable per env (`AI_SIMILARITY_ENABLED`, `AI_KEYWORDS_ENABLED`, `AI_REVIEWER_MATCHING_ENABLED`, `AI_COPYEDIT_ENABLED`, `LANGUAGE_TOOL_ENABLED`).

### Security & Privacy
- **PII redaction in logs:** `redactEventPayload()` strips reviewer/invitedBy blocks before any `Logger` call — prevents email/name leaks in observability pipelines.
- **Secrets isolation:** SMTP credentials live only in the email-service; OpenAI keys live only in the ai-service; neither reaches the Nest backend or the browser.
- **Role-based access control:** Granular permission slugs (`submission.manage_own`, `submission.change_status`, `users.manage_roles`, `email.manage_reminders`) gate every sensitive endpoint.
- **Editor/Journal-manager invitation flow:** Privileged roles cannot self-elevate — require consent-based invitation + explicit accept.
- **CSRF + httpOnly cookie auth:** Double-submit cookie pattern with `X-CSRF-Token` header for browser clients; Bearer token alternative for automation.

### Peer Review Domain
- **Complete submission lifecycle:** Draft → Submitted → Under Review → Revisions Requested → Accepted → Copyediting → Published + terminal Rejected. Clean state machine.
- **Redacted reviewer payloads by review method:** `double_anonymous` strips author identity; `anonymous` (single-blind) hides reviewer from author; `open` is transparent. All three restrict file access to `file_stage = review` only.
- **Multi-copyeditor support:** Multiple copyeditors per submission; sequential query rounds; AI-assisted analysis (format, grammar, reference cross-check).
- **Review package isolation:** Editors curate which files enter `file_stage = review` — reviewers never see the full submission tree.

### Word Constructor (In-app Document Builder)
- **Rich structured editing:** Section-based with bilingual titles/abstracts, authors, IMRaD presets, figures, tables with notes, equations (LaTeX → KaTeX → PNG), back-matter blocks.
- **Styled .docx export:** Curated publication styles (Damascus University Journal profile) — font, margins, heading hierarchy, RTL support.
- **Multi-tab sync:** BroadcastChannel for same-browser draft sync; localStorage persistence for pre-slug compose.
- **Docx import:** Heuristic heading/paragraph mapping from uploaded .docx with stable warning codes.
- **Equation rendering pipeline:** Playwright (Edge/Chrome) → MathJax + sharp fallback — KaTeX preview in UI, PNG images in Word.

### Email Pipeline
- **12 transactional template types** covering the full review lifecycle (reviewer invites, reminders, copyedit, submission/decision, review activity, role invitations).
- **DB-backed templates** editable at runtime via admin UI with optimistic locking (409 on conflict).
- **Scheduled reminders:** Cron-driven per-minute scheduler publishes `reminder.due` events through the same consumer path — one codebase for sends and failure recovery.
- **Idempotency + crash recovery:** `email_log` pre-claim with `ON CONFLICT DO NOTHING` prevents duplicate sends; `pending` state on crash resumes send on redelivery.
- **DLQ + admin replay:** Dead-letter queue with replay endpoint for operator recovery.
- **Noop provider by default:** No SMTP needed in dev — logs would-be sends.

### Testing & Quality
- **Jest (backend unit + e2e), Vitest (frontend lib), Playwright (frontend e2e), pytest (ai-service):** Multi-layered test strategy.
- **Opt-in integration tests:** `npm run test:pipeline` exercises real RabbitMQ for end-to-end outbox → broker → consumer flow.
- **CI-friendly shared contract check:** `npm run check:shared` fails if mirrors drift from canonical source.
- **Structured error codes:** `VALIDATION_ERROR`, `AI_SERVICE_UNAVAILABLE`, `REVIEW_PACKAGE_INCOMPLETE`, `EMAIL_POLICY_CONFLICT` — frontend can branch on stable codes.

### i18n & RTL
- **English + Arabic with full RTL support:** `next-intl`, per-user `preferredLocale`, locale-specific email templates with fallback to `en`.
- **Arabic discipline classifier:** Fine-tuned AraBERT for 10 Arabic discipline labels — integrated via gRPC `ClassifierService`.
- **Direction heuristic for manuscript content:** Per-section Arabic ratio detection with configurable threshold.

### Infrastructure
- **Docker Compose for dev dependencies:** RabbitMQ + LanguageTool with a single `docker compose up`.
- **Swagger API docs:** Auto-generated OpenAPI at `/api-docs` with production toggle.
- **Rate limiting by handler:** Separate limits for login/register, upload, DOCX generation, SSE, public routes.
- **SSE for live notifications:** Server-Sent Events stream unread counts and new notifications in real-time.

---

## Weaknesses

### Architecture & Scalability
- **SSE is single-process only:** `NotificationHub` uses an in-process RxJS Subject — horizontal scaling breaks live notifications unless a shared pub/sub (Redis/NATS) replaces the bus.
- **Rate limiter is in-memory:** Single-instance only; horizontal scale needs Redis-backed `ThrottlerStorage`.
- **No refresh tokens / session management beyond short-lived JWT:** Logout invalidates `jti` server-side, but no long-lived refresh flow yet. OAuth/ORCID deferred.
- **Email-service shares Postgres with backend:** Same database server, different schema. This couples the two services at the DB layer — a production incident on one schema affects the host.
- **No async AI jobs:** Long-running AI tasks (plagiarism corpus indexing) execute synchronously in gRPC — no RabbitMQ-backed job queue for timeout-heavy work.

### Peer Review Gaps
- **No `under_review` notification to author:** When the editor sets under_review (or a reviewer accept auto-transitions), the author is not emailed. Deferred to v2.1.
- **No password reset / registration welcome email:** Fundamental self-service flows are unimplemented.
- **No author message on decision:** Editor decision emails cannot include rationale — the API lacks an optional `messageForAuthor` field.
- **No proactive reminder cancellation:** When a reviewer accepts/declines/completes, pending reminders are not cancelled — they are only dropped at handler time if the row is no longer `pending`.
- **No multi-journal support:** Single-journal MVP. `Journal` entity exists as a stub but is not wired into multi-tenant flows.

### Word Constructor Limitations
- **No footnotes/endnotes:** Deferred to v2.
- **No merged table cells:** Tables are flat string grids — no `rowspan`/`colspan`.
- **No inline images in paragraphs:** TipTap's image extension is disabled — authors must use separate `image` sections.
- **No bidirectional fine-grained marks:** Direction is per-section; mixing LTR/RTL within a paragraph relies on browser bidi algorithm only.
- **No live collaborative editing:** Multi-tab sync via BroadcastChannel covers same-browser, same-user drafts only.
- **Equations are PNG images in Word, not editable OMML:** Authors cannot edit equations natively in Word — full re-render from LaTeX source is required.
- **DOCX ↔ constructor round-trip:** Uploaded .docx can be imported into the constructor (heuristic merge), but constructor content cannot be reverse-engineered back into a structured editor state — mode switch is destructive.

### Code & DX
- **Type mirroring without a build tool:** `packages/shared/` copies files via a `sync:shared` script into two Nest apps — no TypeScript project references or workspace packages. Drift is caught by CI but adds friction.
- **AGENTS.md warns of breaking Next.js changes:** The project uses a Next.js version with undocumented breaking changes — any AI-assisted development must consult `node_modules/next/dist/docs/` first.
- **No migration system for backend entities:** Uses TypeORM `synchronize: true` for development — no proper migration pipeline before production.
- **No pre-commit hooks or formatting enforcement:** No mention of Husky, lint-staged, or Prettier/Eslint pre-commit checks in any README or config.

### AI Service
- **No Docker Compose service for ai-service:** Unlike RabbitMQ/LanguageTool, the ai-service runs only on the host in dev — no `docker-compose.dev.yml` entry yet (commented out).
- **AraBERT weights not versioned:** Weights are gitignored and must be manually placed — no automated download or CI pipeline for model artifacts.
- **Limited provider layer:** Only `noop` and `openai` providers implemented. No Anthropic, Azure OpenAI, or local LLM (Ollama) support.
- **gRPC streaming for LLM tokens deferred:** No server-side streaming RPC for token-by-token LLM output.

### Testing
- **No Playwright E2E for Arabic UI locale:** RTL/manuscript build flow in `/ar/` locale is untested.
- **No E2E for full submit-for-review happy path:** Validation path is mocked — not exercised against real backend validation.
- **No performance/load tests:** No benchmarks for concurrent review submissions, email pipeline throughput, or AI service latency under load.
- **No test for equation PNG generation in DOCX:** The rendered equation image inside downloaded .docx is not byte-inspected.

### Operations
- **No health check for email-service readiness:** Has liveness on port 5244, but the `/ready` endpoint's semantics are undocumented.
- **No structured logging standard:** Each service uses its own logging approach (Nest Logger, Python logging) — no shared correlation ID propagation or structured JSON format across services.
- **Manual email-service grant SQL:** Backend needs raw SQL grants (`grant-email-reminder-admin.sql`) to read `email.*` — not automated in migrations.
- **No CI matrix for Python optional extras:** AI-service CI may not test the `[ml]` and `[similarity]` extras in separate jobs.

### Documentation & Diagrams
- **PlantUML diagrams not rendered in-repo:** Use case, sequence, and activity diagrams are `.puml` source files only — no generated PNG/SVG committed.
- **Informal walkthrough file (`email-details.md`) may drift:** README explicitly warns it may lag the canonical plan — confusion risk for new contributors.
- **No API client/collection file:** No Postman collection, Insomnia export, or `.http`/`.bruno` file for manual API exploration.
