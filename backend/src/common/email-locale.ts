/** Supported outbound email locales (matches frontend routing.locales). */
export type EmailLocale = 'en' | 'ar';

export const EMAIL_LOCALES: readonly EmailLocale[] = ['en', 'ar'];

export function parseEmailLocale(
  raw: string | null | undefined,
): EmailLocale | null {
  if (raw === 'ar' || raw === 'en') return raw;
  return null;
}

export function normalizeEmailLocale(
  raw: string | null | undefined,
): EmailLocale {
  return parseEmailLocale(raw) ?? 'en';
}

/**
 * Priority: recipient saved preference → editor session header → site default → en.
 */
export function resolveEmailLocale(args: {
  recipientPreferred: string | null | undefined;
  /** Acting user's `X-Folio-Locale` when the HTTP handler passes it. */
  editorHeaderLocale?: string | null | undefined;
  siteDefault: string;
}): EmailLocale {
  const r = parseEmailLocale(args.recipientPreferred ?? undefined);
  if (r) return r;
  const h = parseEmailLocale(args.editorHeaderLocale ?? undefined);
  if (h) return h;
  return normalizeEmailLocale(args.siteDefault);
}
