export type EmailLocale = 'en' | 'ar';

export function normalizeEmailLocale(
  raw: string | null | undefined,
): EmailLocale {
  return raw === 'ar' ? 'ar' : 'en';
}
