# Manuscript publication styles

Human-readable specs for each curated profile live in this folder. The **executable** layout rules are TypeScript profiles under `backend/src/manuscript-styles/profiles/` (see implementation).

| Profile ID | Document |
|------------|----------|
| `damascus-university-journal-v1` | [damascus-university-journal-v1.md](./damascus-university-journal-v1.md) |

The former repo-root `style.md` described only Damascus; it was moved here so the root is not mistaken for a global default across all journals.

## Default style resolution (Phase 1)

Used when `constructorContent.manuscriptStyleId` is absent or empty:

1. Environment variable `DEFAULT_MANUSCRIPT_STYLE_ID` if set and the id exists in the registry.
2. Otherwise the compile-time fallback id (`damascus-university-journal-v1`).

**Phase 2** (when a `Journal` entity exists): between (content id) and env, insert `journal.defaultManuscriptStyleId` when the submission is bound to a journal and content omits `manuscriptStyleId`.

## Removed or unknown profile ids (v1 policy)

If stored content includes a `manuscriptStyleId` that is **not** in the registry, PATCH, submit, and `generate-docx` **fail** with a clear error. There is no silent fallback to default.

**Deprecation:** Profile ids are treated as immutable. To retire a profile, ship a migration path (e.g. data fix or explicit alias in code for one release), then remove it from the registry—never silently remap at runtime without user-visible handling.

## Implementation notes (non-blocking)

- **Catalog `defaultStyleId`:** The public catalog sets **`Cache-Control: no-store`** so proxies do not cache config-dependent `defaultStyleId`.
- **OOXML tests:** Keep helpers dumb (`extractDocumentXml`, attribute lookups)—avoid an OOXML query DSL.
- **Phase 2:** Decide early whether authors may override the journal default (picker stays vs hidden); that choice drives UI surface area.
