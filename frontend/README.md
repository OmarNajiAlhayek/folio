# Damascus University Journal frontend (Next.js)

App Router UI for the Damascus University Journal peer-review workspace. Default dev URL: **`http://localhost:5240`**.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # leave NEXT_PUBLIC_API_URL empty for cookie auth
npm run dev
```

The browser calls same-origin `/api/v1`; Next.js rewrites to the Nest API (`API_PROXY_TARGET`, default `http://127.0.0.1:5243`).

## Documentation

Monorepo overview and run order: [`../README.md`](../README.md).

| Topic            | Doc                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Features by role | [`../docs/feature-report.md`](../docs/feature-report.md)                                     |
| Word Constructor | [`../docs/plans/word-constructor.md`](../docs/plans/word-constructor.md)                     |
| Playwright E2E   | [`../docs/plans/playwright-constructor-e2e.md`](../docs/plans/playwright-constructor-e2e.md) |

## Container image

Built from the **repository root** — the app transpiles `@folio/shared` from `packages/shared`
and `next.config.ts` sets `outputFileTracingRoot` to the monorepo root:

```bash
docker build -f frontend/Dockerfile -t folio/frontend .
```

The build uses Next.js `output: 'standalone'`, so the runtime image carries a self-contained
server plus only traced dependencies — no `npm install`, no dev dependencies, non-root.

`NEXT_PUBLIC_*` values are inlined at build time and are therefore **build arguments**
(`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SENTRY_DSN`), not runtime configuration. Server-side
settings (`API_PROXY_TARGET`, `SENTRY_DSN`) stay runtime env.

Full stack and operations: [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).

## Tests

```bash
npm run e2e:install   # once
npm run test:e2e
```
