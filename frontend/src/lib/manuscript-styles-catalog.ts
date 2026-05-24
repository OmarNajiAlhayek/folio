import { z } from "zod";
import { ApiError } from "@/lib/api-response";
import { publicJson } from "@/lib/public-api";

const previewThemeSchema = z.object({
  fontFamilyLatinStack: z.string(),
  fontFamilyArabicStack: z.string(),
  figureCaptionBelowImage: z.boolean(),
  tableCaptionAboveTable: z.boolean(),
  referencesArabicFirst: z.boolean(),
  figureWord: z.string(),
  tableWord: z.string(),
  referencesHeading: z.string(),
});

const catalogEntrySchema = z.object({
  id: z.string(),
  version: z.number(),
  displayNameKey: z.string(),
  descriptionKey: z.string(),
  previewTheme: previewThemeSchema,
});

export const manuscriptStyleCatalogSchema = z.object({
  /** Depends on `DEFAULT_MANUSCRIPT_STYLE_ID`; do not cache as eternally static. */
  defaultStyleId: z.string(),
  styles: z.array(catalogEntrySchema),
});

export type ManuscriptPreviewTheme = z.infer<typeof previewThemeSchema>;
export type ManuscriptStyleCatalogEntry = z.infer<typeof catalogEntrySchema>;
export type ManuscriptStyleCatalog = z.infer<typeof manuscriptStyleCatalogSchema>;

export type ManuscriptStyleCatalogFetchResult =
  | { ok: true; data: ManuscriptStyleCatalog }
  | {
      ok: false;
      kind: "http" | "schema" | "network";
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
  fontFamilyArabicStack:
    '"Simplified Arabic", "Noto Naskh Arabic", serif',
  figureCaptionBelowImage: true,
  tableCaptionAboveTable: true,
  referencesArabicFirst: true,
  figureWord: "Figure",
  tableWord: "Table",
  referencesHeading: "References",
};

/** @param _apiBase Ignored; uses `NEXT_PUBLIC_API_URL` via `publicJson`. */
export async function fetchManuscriptStyleCatalog(
  _apiBase?: string,
): Promise<ManuscriptStyleCatalogFetchResult> {
  try {
    const json: unknown = await publicJson("/public/manuscript-styles", {
      cache: "no-store",
    });
    const parsed = manuscriptStyleCatalogSchema.safeParse(json);
    if (!parsed.success) {
      console.error(
        "[fetchManuscriptStyleCatalog] schema validation failed",
        parsed.error.flatten(),
      );
      return {
        ok: false,
        kind: "schema",
        message: "Invalid manuscript styles catalog",
        detail: parsed.error.flatten(),
      };
    }
    return { ok: true, data: parsed.data };
  } catch (e) {
    if (e instanceof ApiError) {
      console.error("[fetchManuscriptStyleCatalog] HTTP error", e);
      return {
        ok: false,
        kind: "http",
        message: e.message,
        detail: { status: e.status, code: e.code },
      };
    }
    console.error("[fetchManuscriptStyleCatalog] network or parse error", e);
    return {
      ok: false,
      kind: "network",
      message: "Network error",
      detail: e,
    };
  }
}
