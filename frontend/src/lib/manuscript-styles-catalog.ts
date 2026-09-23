import { z } from 'zod';
import { ApiError } from '@/lib/api-response';
import { publicJson } from '@/lib/public-api';

/**
 * `apa` — (Author, Year) citations, list sorted alphabetically.
 * `vancouver` — numbered [1] citations, list kept in order of first citation.
 */
const citationStyleSchema = z.enum(['apa', 'vancouver']);

const previewThemeSchema = z.object({
  fontFamilyLatinStack: z.string(),
  fontFamilyArabicStack: z.string(),
  figureCaptionBelowImage: z.boolean(),
  tableCaptionAboveTable: z.boolean(),
  referencesArabicFirst: z.boolean(),
  figureWord: z.string(),
  tableWord: z.string(),
  referencesHeading: z.string(),
  /** Left-to-right counterparts; fall back to the words above. */
  figureWordLtr: z.string().optional(),
  tableWordLtr: z.string().optional(),
  referencesHeadingLtr: z.string().optional(),
  captionNumberFormat: z.enum(['colon', 'parenthesized']).optional(),
  referencesNumbered: z.boolean().optional(),
  tableBorders: z.enum(['grid', 'horizontalRules']).optional(),
  /** Article-language front matter first, the other language next, then the body. */
  bilingualFrontMatter: z.boolean().optional(),
  /** Citation style by the journal's `disciplineLabel`; absent → APA for every journal. */
  citationStyles: z
    .object({
      default: citationStyleSchema,
      byDisciplineLabel: z.record(z.string(), citationStyleSchema).optional(),
    })
    .optional(),
});

const constructorGuidanceSchema = z.object({
  extraMandatorySlots: z
    .array(
      z.enum([
        'acknowledgments',
        'funding',
        'conflictOfInterest',
        'dataAvailability',
      ]),
    )
    .optional(),
  recommendedPresets: z
    .array(
      z.enum([
        'introduction',
        'literatureReview',
        'materialsAndMethods',
        'resultsAndDiscussion',
        'conclusions',
      ]),
    )
    .optional(),
  requiredRichTextKinds: z
    .array(
      z.enum([
        'acknowledgments',
        'funding',
        'conflictOfInterest',
        'dataAvailability',
      ]),
    )
    .optional(),
  defaultDocumentDir: z.enum(['ltr', 'rtl']).optional(),
});

const catalogEntrySchema = z.object({
  id: z.string(),
  version: z.number(),
  displayNameKey: z.string(),
  descriptionKey: z.string(),
  previewTheme: previewThemeSchema,
  constructorGuidance: constructorGuidanceSchema.optional(),
});

export const manuscriptStyleCatalogSchema = z.object({
  /** Depends on `DEFAULT_MANUSCRIPT_STYLE_ID`; do not cache as eternally static. */
  defaultStyleId: z.string(),
  styles: z.array(catalogEntrySchema),
});

export type ManuscriptPreviewTheme = z.infer<typeof previewThemeSchema>;
export type CitationStyle = z.infer<typeof citationStyleSchema>;

/** Mirrors the backend `resolveCitationStyle`: the manuscript's journal decides. */
export function resolveCitationStyle(
  theme: ManuscriptPreviewTheme,
  journalDisciplineLabel: string | null | undefined,
): CitationStyle {
  const rule = theme.citationStyles;
  if (!rule) return 'apa';
  const label = journalDisciplineLabel?.trim();
  return (label && rule.byDisciplineLabel?.[label]) || rule.default;
}
export type ManuscriptConstructorGuidance = z.infer<
  typeof constructorGuidanceSchema
>;
export type ManuscriptStyleCatalogEntry = z.infer<typeof catalogEntrySchema>;
export type ManuscriptStyleCatalog = z.infer<
  typeof manuscriptStyleCatalogSchema
>;

export type ManuscriptStyleCatalogFetchResult =
  | { ok: true; data: ManuscriptStyleCatalog }
  | {
      ok: false;
      kind: 'http' | 'schema' | 'network';
      /** User-facing summary */
      message: string;
      /** For debugging / conditional UI (retry on network, etc.) */
      detail?: unknown;
    };

/**
 * Matches Damascus UI defaults when the catalog cannot be loaded.
 * Deployments whose server default is not Damascus may show a mismatched
 * preview until the catalog loads — generate-docx always uses the API default.
 */
export const DAMASCUS_PREVIEW_THEME_FALLBACK: ManuscriptPreviewTheme = {
  fontFamilyLatinStack: '"Times New Roman", "Liberation Serif", serif',
  fontFamilyArabicStack: '"Simplified Arabic", "Noto Naskh Arabic", serif',
  figureCaptionBelowImage: true,
  tableCaptionAboveTable: true,
  referencesArabicFirst: true,
  figureWord: 'الشكل',
  tableWord: 'الجدول',
  referencesHeading: 'المراجع',
  figureWordLtr: 'Figure',
  tableWordLtr: 'Table',
  referencesHeadingLtr: 'References',
  captionNumberFormat: 'parenthesized',
  referencesNumbered: true,
  tableBorders: 'horizontalRules',
  bilingualFrontMatter: true,
  citationStyles: {
    default: 'apa',
    byDisciplineLabel: { 'العلوم الطبية': 'vancouver' },
  },
};

/** @param _apiBase Ignored; uses `NEXT_PUBLIC_API_URL` via `publicJson`. */
export async function fetchManuscriptStyleCatalog(
  _apiBase?: string,
): Promise<ManuscriptStyleCatalogFetchResult> {
  void _apiBase;
  try {
    const json: unknown = await publicJson('/public/manuscript-styles', {
      cache: 'no-store',
    });
    const parsed = manuscriptStyleCatalogSchema.safeParse(json);
    if (!parsed.success) {
      console.error(
        '[fetchManuscriptStyleCatalog] schema validation failed',
        parsed.error.flatten(),
      );
      return {
        ok: false,
        kind: 'schema',
        message: 'Invalid manuscript styles catalog',
        detail: parsed.error.flatten(),
      };
    }
    return { ok: true, data: parsed.data };
  } catch (e) {
    if (e instanceof ApiError) {
      console.error('[fetchManuscriptStyleCatalog] HTTP error', e);
      return {
        ok: false,
        kind: 'http',
        message: e.message,
        detail: { status: e.status, code: e.code },
      };
    }
    console.error('[fetchManuscriptStyleCatalog] network or parse error', e);
    return {
      ok: false,
      kind: 'network',
      message: 'Network error',
      detail: e,
    };
  }
}
