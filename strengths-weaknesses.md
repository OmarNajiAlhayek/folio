# Folio — Strengths & Weaknesses Analysis

## Strengths

### Architecture & Design
- **Well-separated microservices architecture:** NestJS backend (HTTP API), standalone email-service (RabbitMQ consumer + cron), Python ai-service (gRPC). Each has clear boundaries and independent scaling.
- **Transactional outbox pattern:** RabbitMQ events go through `outbound_event_outbox` in the same DB transaction as domain writes — guarantees at-least-once delivery without two-phase commit.
- **Shared canonical contracts:** `@folio/shared` workspace package is the single source of truth for event types, routing keys, idempotency builders, and topology — imported directly by both Nest apps.
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
- **Dedicated email database:** email-service owns `folio_email` on a separate Postgres instance; backend reaches email data only via authenticated `/internal/*` HTTP (BFF proxy), not cross-schema SQL.
- **15 transactional template types** covering auth (verification OTP, password reset, registration welcome), the full review lifecycle (reviewer invites, reminders, copyedit, submission/decision, review activity, role invitations).
- **DB-backed templates** editable at runtime via admin UI with optimistic locking (409 on conflict).
- **Scheduled reminders:** Cron-driven per-minute scheduler publishes `reminder.due` events through the same consumer path — one codebase for sends and failure recovery.
- **Proactive reminder cancellation:** On decline or review submit, backend enqueues `reviewer.responded` via the outbox; email-service bulk-cancels pending reminders for that assignment (accept keeps due-soon/overdue nudges for in-progress reviews).
- **Idempotency + crash recovery:** `email_log` pre-claim with `ON CONFLICT DO NOTHING` prevents duplicate sends; `pending` state on crash resumes send on redelivery.
- **DLQ + admin replay:** Dead-letter queue with replay endpoint for operator recovery.
- **Noop provider by default:** No SMTP needed in dev — logs would-be sends.

### Code & DX
- **`@folio/shared` workspace package:** Event contracts and messaging helpers compile once and link into both Nest apps — no mirror copies or sync scripts.
- **Backend TypeORM migrations:** Schema changes ship as versioned migrations (`npm run migrate`); auto-run on API startup by default.
- **Pre-commit formatting:** Husky + lint-staged run Prettier and ESLint on staged TypeScript from the repo root.

### Testing & Quality
- **Jest (backend unit + e2e), Vitest (frontend lib), Playwright (frontend e2e), pytest (ai-service):** Multi-layered test strategy.
- **Opt-in integration tests:** `npm run test:pipeline` exercises real RabbitMQ for end-to-end outbox → broker → consumer flow.
- **Workspace shared package:** `@folio/shared` compiles once and links into backend and email-service — no mirror drift.
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
- **Async AI jobs:** Long-running similarity indexing and corpus-similarity reports use `ai_jobs` + transactional outbox → RabbitMQ (`ai.similarity_index`, `ai.corpus_similarity` queues) with pollable job status and tab-safe resume via `/jobs/latest`.

---

## Weaknesses

### Architecture & Scalability
- **SSE is single-process only:** `NotificationHub` uses an in-process RxJS Subject — horizontal scaling breaks live notifications unless a shared pub/sub (Redis/NATS) replaces the bus.
- **Rate limiter is in-memory:** Single-instance only; horizontal scale needs Redis-backed `ThrottlerStorage`.
- **ORCID requires operator setup:** OAuth is implemented (sign-in, linking, hybrid accounts) but needs ORCID developer credentials and `ORCID_ENABLED=true` per environment; no generic institutional SSO yet.
### Peer Review Gaps
- ~~**No proactive reminder cancellation**~~ **Resolved:** `reviewer.responded` outbox event cancels pending reminders on decline and review submit; `reminder.due` still no-ops if status is no longer `pending`.
- **Reminders scheduled from invite time, not accept:** Due-soon/overdue rows are created at invitation; a slow-to-accept reviewer could get a "complete your review" nudge while still `INVITED`. Follow-up: reschedule or create reminders on accept, and optionally guard `reminder.due` sends when assignment is not `ACCEPTED`.
- **No multi-journal support:** Single-journal MVP. `Journal` entity exists as a stub but is not wired into multi-tenant flows.

### Word Constructor Limitations
- ~~**No footnotes/endnotes**~~ **Resolved (v2):** Document-level `footnotes[]` with inline refs; Word footnote/endnote export.
- ~~**No merged table cells**~~ **Resolved (v2):** `ConstructorTableCell` grid with merge UI and DOCX `rowSpan`/`colSpan`.
- ~~**No inline images in paragraphs**~~ **Resolved (v2):** Inline image node via server `fileId` (no base64).
- ~~**No bidirectional fine-grained marks**~~ **Resolved (v2):** `textDirection` mark + per-run RTL in DOCX.
- ~~**No live collaborative editing**~~ **Resolved (v2):** WebSocket sync per submission slug + BroadcastChannel for pre-slug drafts.
- ~~**Equations are PNG in Word**~~ **Resolved (v2):** LaTeX → OMML (PNG fallback).
- ~~**DOCX ↔ constructor round-trip**~~ **Improved (v2):** `POST .../reimport-attached-constructor-docx`; import/export fidelity improved. Arbitrary external Word files remain heuristic.

#### Remaining caveats (honest)
- **Collab is last-write-wins over WebSocket** (not full CRDT/Yjs); fine for same-author multi-tab/device, not Google Docs–level merging.
- **Round-trip is much better for your exported DOCX**; arbitrary external Word files are still heuristic.
- **Pre-slug compose still needs a saved submission (`slug`)** for inline images and WebSocket collab.

### Code & DX
- **SSE is single-process only (see Architecture):** Live notifications still need a shared pub/sub layer for horizontal scale.
- **Rate limiter is in-memory (see Architecture):** Redis-backed throttling still deferred.

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
- ~~**No structured logging standard:**~~ **Resolved** — OpenTelemetry + structured JSON logs with `trace_id` / `request_id` propagation; see [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md).
- **No CI matrix for Python optional extras:** AI-service CI may not test the `[ml]` and `[similarity]` extras in separate jobs.

### Documentation & Diagrams
- **PlantUML diagrams not rendered in-repo:** Use case, sequence, and activity diagrams are `.puml` source files only — no generated PNG/SVG committed.
- **Informal walkthrough file (`email-details.md`) may drift:** README explicitly warns it may lag the canonical plan — confusion risk for new contributors.
- **No API client/collection file:** No Postman collection, Insomnia export, or `.http`/`.bruno` file for manual API exploration.
