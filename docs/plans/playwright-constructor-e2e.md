# Word Constructor — Playwright E2E plan

End-to-end tests for the Word Constructor live in the **frontend** package. They exercise real browser flows against locally started backend + Next.js dev servers.

Runbook: [README — Playwright E2E](../../README.md#playwright-e2e-word-constructor).

## Goals

1. **Regression guard** for mode routing, compose URLs, and legacy redirects.
2. **Persistence** — pre-slug `localStorage`, post-slug autosave (`PATCH` 200), refresh survival.
3. **Integration smoke** — real `POST .../generate-docx` (MIME, minimum size).
4. **UX contracts** — validation banner + jump-to-section, RTL preview `dir`, unsaved body sent on generate.
5. **Coexistence** — upload + constructor on detail without breaking presentation picker rules.

Tests intentionally avoid flaking on fixed `setTimeout` for autosave; they wait on network responses instead.

## Layout

| Path | Role |
|------|------|
| [`frontend/playwright.config.ts`](../../frontend/playwright.config.ts) | `webServer`, workers, `globalSetup`, `baseURL` |
| [`frontend/e2e/constructor.spec.ts`](../../frontend/e2e/constructor.spec.ts) | Constructor scenarios |
| [`frontend/e2e/global-setup.ts`](../../frontend/e2e/global-setup.ts) | Idempotent worker user registration |
| [`frontend/e2e/fixtures/auth.ts`](../../frontend/e2e/fixtures/auth.ts) | Per-test login + `authToken` |
| [`frontend/e2e/helpers/e2e-api.ts`](../../frontend/e2e/helpers/e2e-api.ts) | API base URL, `createSubmission`, file upload |
| [`frontend/e2e/helpers/waits.ts`](../../frontend/e2e/helpers/waits.ts) | `waitForAutosave` — successful `PATCH /submissions/:slug` |
| [`frontend/e2e/helpers/hide-next-dev-portals.ts`](../../frontend/e2e/helpers/hide-next-dev-portals.ts) | Hide Next dev overlay for stable clicks |
| [`frontend/e2e/fixtures/validation-errors.ts`](../../frontend/e2e/fixtures/validation-errors.ts) | Mock 400 payload for submit interception |
| [`frontend/e2e/fixtures/minimal-import.docx`](../../frontend/e2e/fixtures/minimal-import.docx) | Small DOCX for import smoke |

## Environment and servers

`playwright.config.ts` starts:

1. **Backend** — `npm run start:dev` in `backend/`, health at `http://localhost:5243/api/v1/health` (override with `E2E_BACKEND_PORT`).
2. **Frontend** — `npm run dev` with `NEXT_PUBLIC_API_URL` pointing at the API (Bearer auth for E2E; `AUTH_RETURN_BEARER=true` on backend).

| Variable | Default | Purpose |
|----------|---------|---------|
| `E2E_FRONTEND_PORT` | `5240` | Next dev port |
| `E2E_BACKEND_PORT` | `5243` | Nest port |
| `E2E_API_URL` | `http://127.0.0.1:5243` | Playwright `request` context base (normalized to `/api/v1/`) |
| `E2E_WORKERS` | `1` local, `4` CI | Parallel workers |
| `REUSE_DEV_SERVER` | unset | Set `1` locally to reuse an already-running `next dev` with matching env |

CI: `reuseExistingServer: false` for frontend; retries `2`, workers `4`.

### Install browsers

From `frontend/`:

```bash
npm run e2e:install
npm run test:e2e
```

Backend equation rendering for DOCX smoke may need Chromium on Linux CI: `npx playwright install chromium` in `backend/` (see [word-constructor.md](./word-constructor.md)).

## Worker users

`global-setup.ts` registers one user per worker index:

- Email: `e2e-worker-{index}@test.local`
- Password: `WorkerPass123!`

`ensureUserExists` treats HTTP 409 as success (idempotent re-runs). Credentials: [`workerCredentials`](../../frontend/e2e/helpers/e2e-api.ts).

The auth fixture logs in via API and exposes `authToken` for setup shortcuts (`createSubmission`, `patchConstructorContent`).

## Autosave contract

[`waitForAutosave`](../../frontend/e2e/helpers/waits.ts) resolves on the first response where:

- Method `PATCH`
- Status `200`
- URL matches `/api/v1/submissions/{slug}` (no trailing action segment)

Do not replace this with arbitrary sleeps when adding tests.

## Coverage matrix (implemented)

| Test | What it asserts |
|------|-----------------|
| `mode routing and sticky upload mode` | Builder → `/compose/create`; upload mode sticks via `?mode=upload` and survives reload |
| `legacy constructor/create redirects` | `/submissions/constructor/create` → `/compose/create` |
| `pre-slug to post-slug transition...` | localStorage draft → new submission → slug compose; draft cleared; autosave + reload; legacy `/constructor` → `/compose` |
| `detail offers upload and constructor...` | Draft vs constructor-committed detail UI |
| `slug compose imports docx...` | Import fixture, autosave, reload retains title |
| `pre-slug staged upload survives...` | File choice on `/new` survives navigation to compose and back |
| `upload and constructor coexist on detail` | Both presentation sources; no erroneous switch CTA |
| `validation banner renders...` | Mocked submit 400 → banner + jump focuses section editor |
| `docx generate flow...` | Real POST 200, DOCX MIME, body > 5 KiB; RTL preview `dir` |
| `generate-docx POST body includes unsaved...` | Generate sends current editor text without waiting for autosave |
| `expanded section kinds...` | IMRaD preset, table note, acknowledgments, numbered equation + localStorage snapshot |

`test.setTimeout(60_000)` on the spec file accounts for cold `webServer` startup.

## API helpers

[`e2e-api.ts`](../../frontend/e2e/helpers/e2e-api.ts) documents a common pitfall: `request` base URL **must** end with `/api/v1/` so relative paths like `auth/register` do not drop the prefix. Use `apiV1Absolute('submissions/...')` for route interception in browser tests.

`createSubmission` and `uploadManuscriptFile` seed server state without driving the full UI wizard when unnecessary.

## Stability practices

- Call `hideNextJsDevPortals(page)` after navigation on compose routes (dev overlay blocks clicks).
- Prefer `getByTestId` for constructor controls (`constructor-mode-builder`, `constructor-generate-docx`, `constructor-validation-jump-*`, etc.).
- Use `expect.poll` for `localStorage` assertions where React write timing varies.
- Intercept submit with `page.route` + [`mockedValidationErrors`](../../frontend/e2e/fixtures/validation-errors.ts) instead of forcing invalid server state.

## Gaps and future cases

Not yet automated (candidates when flakiness is manageable):

- Full **submit for review** happy path with real backend validation (today: validation path is mocked).
- **Equation PNG** inside downloaded DOCX byte inspection.
- **Arabic UI locale** (`/ar/...`) mirror of critical flows.
- **Mode switch** with cleanup confirmation dialog.
- **BroadcastChannel** second-tab sync (two `page` contexts in one test).
- CI job matrix documenting backend Chromium install explicitly.

When adding tests, extend this table and keep README “Coverage currently automated” in sync.

## Related docs

- [Word Constructor design](./word-constructor.md)
- [README — prerequisites & sample accounts](../../README.md)
