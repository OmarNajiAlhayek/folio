<!-- BEGIN:nextjs-agent-rules -->

# Next.js 16 (App Router)

Folio frontend uses **Next.js 16.x** with the **App Router** (`src/app/[locale]/…`). Before changing routing, data fetching, or build config, read the matching guide:

| Topic                   | Where to look                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Project conventions     | This repo: `frontend/src/app/`, `frontend/next.config.ts`, `frontend/middleware.ts` |
| Bundled Next.js 16 docs | `node_modules/next/dist/docs/` (start at `index.md`)                                |
| Official reference      | [nextjs.org/docs](https://nextjs.org/docs)                                          |

### Folio-specific rules

- **i18n:** `next-intl` with locales `en` and `ar` under `src/app/[locale]/`. User-facing copy lives in `messages/`.
- **API access:** Browser calls same-origin `/api/v1` (Next.js rewrites to Nest). Do **not** set `NEXT_PUBLIC_API_URL` to the backend host — it breaks httpOnly cookie auth.
- **Auth:** CSRF double-submit (`X-CSRF-Token` header) with credentials on fetch calls.
- **Styling:** Tailwind CSS v4; shared UI in `src/components/ui/`.
- **Instant navigation:** Next.js 16 may require `unstable_instant` exports for fast client navigations — see `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.mdx` before tuning Suspense-only fixes.

Heed deprecation notices in the bundled docs and prefer patterns already used in this codebase over older Next 13/14 examples from training data.

<!-- END:nextjs-agent-rules -->
