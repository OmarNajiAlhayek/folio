// `vitest.config.ts` sets `globals: true`, so specs may use `describe`, `it` and
// `expect` without importing them. This tells TypeScript the same thing —
// without it, `next build` fails type checking on any spec written in that
// style, which is what broke the production build before CI ever ran it.
/// <reference types="vitest/globals" />
