/** Matches next-intl `localePrefix: "always"` in the Folio frontend. */
export type FolioUiLocale = 'en' | 'ar';

export function folioUiLocale(emailLocale: string | undefined): FolioUiLocale {
  return emailLocale === 'ar' ? 'ar' : 'en';
}

export function stripAppBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export function assignmentInvitePageUrl(
  baseUrl: string,
  assignmentSlug: string,
  emailLocale: string | undefined,
): string {
  const root = stripAppBaseUrl(baseUrl);
  const locale = folioUiLocale(emailLocale);
  const slug = encodeURIComponent(assignmentSlug);
  return `${root}/${locale}/assignments/${slug}/invite`;
}

export function assignmentReviewPageUrl(
  baseUrl: string,
  assignmentSlug: string,
  emailLocale: string | undefined,
): string {
  const root = stripAppBaseUrl(baseUrl);
  const locale = folioUiLocale(emailLocale);
  const slug = encodeURIComponent(assignmentSlug);
  return `${root}/${locale}/assignments/${slug}/review`;
}
