/**
 * Shared layout widths and padding for consistent, denser page shells.
 *
 * Spacing scale: 2, 3, 4, 6, 8 (no ad-hoc values outside this set).
 * Workflow pages use PAGE_SHELL (max-w-6xl).
 * Reading/form pages use PAGE_SHELL_NARROW (max-w-4xl).
 */
export const PAGE_SHELL =
  "mx-auto w-full max-w-6xl px-4 sm:px-6 py-5 sm:py-6";

/** Long forms and reading views: narrower column, comfortable vertical rhythm */
export const PAGE_SHELL_NARROW =
  "mx-auto w-full max-w-4xl px-4 sm:px-6 py-6 sm:py-8";

/**
 * Compact empty-state panel: replaces the oversized mt-14 py-14 pattern.
 * Add your content (icon/text/cta) inside; it handles layout and surface.
 */
export const EMPTY_STATE_CLS =
  "mt-8 flex flex-col items-center gap-3 rounded-xl border border-dashed border-ink/15 bg-surface/60 px-6 py-10 text-center shadow-sm";

/** Standard gap between major page sections */
export const PAGE_SECTION_GAP = "mt-6";

/** Standard gap between a page header and its first list/grid */
export const PAGE_LIST_GAP = "mt-6";
