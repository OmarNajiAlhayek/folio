# Folio frontend (Next.js)

App Router UI for the Folio peer-review workspace. Default dev URL: **`http://localhost:5240`**.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # leave NEXT_PUBLIC_API_URL empty for cookie auth
npm run dev
```

The browser calls same-origin `/api/v1`; Next.js rewrites to the Nest API (`API_PROXY_TARGET`, default `http://127.0.0.1:5243`).

## Documentation

Monorepo overview and run order: [`../README.md`](../README.md).

| Topic | Doc |
|-------|-----|
| Features by role | [`../docs/feature-report.md`](../docs/feature-report.md) |
| Word Constructor | [`../docs/plans/word-constructor.md`](../docs/plans/word-constructor.md) |
| Playwright E2E | [`../docs/plans/playwright-constructor-e2e.md`](../docs/plans/playwright-constructor-e2e.md) |

## Tests

```bash
npm run e2e:install   # once
npm run test:e2e
```
