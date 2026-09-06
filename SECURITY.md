# Security

## Reporting a vulnerability

**Do not open a public issue for a security problem.** Use GitHub's private vulnerability
reporting on this repository (*Security → Report a vulnerability*), or contact the maintainers
privately.

Please include what you did, what happened, and what you expected — a request/response pair or
a short reproduction is worth more than a scanner report. Expect an acknowledgement before a
fix; coordinated disclosure is welcome.

Out of scope: findings that only apply to the development defaults documented below
(`EMAIL_PROVIDER=noop`, `guest:guest` RabbitMQ, seeded sample accounts, `changeme` passwords).
Those exist so a fresh checkout runs offline and are refused by the startup checks in any
environment that looks deployed.

---

## Security model

**The browser never holds a token.** The access token is an httpOnly `folio_access` cookie, and
the browser calls same-origin `/api/v1/*`, which Next.js rewrites server-side to the API.
Pointing `NEXT_PUBLIC_API_URL` directly at the API defeats this and is additionally blocked by
CSP (`connect-src 'self'`).

**Internal services are not reachable from a browser.** ai-service and email-service are on the
internal network only. Both calls carry a shared secret — `x-folio-service-token` as gRPC
metadata and as an HTTP header. ai-service **refuses to start** with a non-loopback
`GRPC_BIND_HOST` and no `AI_SERVICE_TOKEN`, so a container bind cannot be accidentally open.

**Authorisation is two-layered.** A route guard performs coarse role checks; service-level
checks enforce ownership and workflow state. The guard alone cannot express "this editor owns
this submission", so both layers are required — see [`docs/authorization.md`](docs/authorization.md).

**Requests are audited.** Every non-health request is written to `audit_log` (sampled by
`AUDIT_SAMPLE_RATE`) and purged on the schedule in `AUDIT_RETENTION_DAYS`. Two classes of field
are redacted from the stored body: credentials (passwords, tokens, OTPs — matched by suffix, so
`newPassword` is covered) and confidential editorial text (reviewer comments, recommendations,
decision letters, copyedit notes, discussion bodies). The audit log records *who did what*; it is
not a second copy of the manuscript pipeline, and it must not become a way for a journal manager
to read a double-anonymous review that `submission-response.mapper.ts` withholds.

**Responses are mapped, not returned.** `User` rows carry `passwordHash`, so no handler returns an
entity — or a relation — directly. Staff-facing shapes go through `users/user-summary.ts` and
`submissions/assignment-response.mapper.ts`. `@Exclude()` on the column plus a global
`ClassSerializerInterceptor` is the backstop, not the plan;
`response-mappers.no-secret-leak.spec.ts` asserts both layers.

**Rate limits are per handler.** Login, registration, refresh, OTP, password reset, upload,
DOCX conversion and SSE each have their own budget rather than sharing one global bucket.

**Startup refuses weak configuration.** Example or short secrets, `guest:guest` broker
credentials and similar are rejected when the environment looks deployed — HTTPS
`APP_BASE_URL`, a remote database, or `AUTH_COOKIE_SECURE=true`. `RUNTIME_CONFIG_STRICT=true`
forces the same checks in an environment that looks local.

---

## Handling secrets

- `.env` files are gitignored. `.env.example` files contain placeholders and comments only.
- Every secret gets its own value — never reuse one string across two variables.
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
- Container images take configuration from the environment. `.dockerignore` excludes `.env`
  files from every build context so a secret cannot be baked into a layer.
- Rotating `JWT_SECRET` invalidates every issued access token — expected, and the correct
  response to a suspected leak.
- If a secret reaches a commit, rotate it first, then clean history. Rotation is what actually
  ends the exposure.

---

## Data handling

**Plagiarism corpus text retention is deliberately asymmetric.** Full text is stored only for
`folio_submission` and `back_catalog` sources; `external_oa` and `web` sources are
fingerprint-only, so third-party articles are never retained verbatim.

**Two plagiarism rules are load-bearing, not incidental.** Authors cannot run corpus similarity
against their own submission — otherwise they iterate until they evade detection — and a match
against a submission that is not published must never reach a report. Treat both as security
properties, not features.

**Uploads are user-supplied files.** `UPLOAD_DIR` is a plain directory; it must not be served
as static content from the public origin.

**Peer review is double-blind.** Reviewer identity is not exposed to authors through any API
response, event payload or email template. Log redaction is shared code
(`packages/shared/messaging/redactor.ts`) so the API and the email worker strip the same fields.

---

## Deploying safely

The hardening checklist — TLS, cookie flags, unpublished ports, pinned image tags, backups —
is in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#4-production-hardening-checklist). Containers
run as a non-root user (uid 1001) with `no-new-privileges`, and no image ships a compiler or
dev dependencies.
