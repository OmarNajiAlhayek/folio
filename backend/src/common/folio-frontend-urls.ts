/** Matches next-intl `localePrefix: "always"` in the Folio frontend. */
export type FolioUiLocale = 'en' | 'ar';

export function folioUiLocale(emailLocale: string | undefined): FolioUiLocale {
  return emailLocale === 'ar' ? 'ar' : 'en';
}

export function stripAppBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/** Reviewer invitation page (accept / decline actions in the UI). */
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

/** Email verification page (OTP entry). */
export function verifyEmailPageUrl(
  baseUrl: string,
  emailLocale: string | undefined,
): string {
  const root = stripAppBaseUrl(baseUrl);
  const locale = folioUiLocale(emailLocale);
  return `${root}/${locale}/verify-email`;
}

/** Signed-in home dashboard. */
export function dashboardPageUrl(
  baseUrl: string,
  emailLocale: string | undefined,
): string {
  const root = stripAppBaseUrl(baseUrl);
  const locale = folioUiLocale(emailLocale);
  return `${root}/${locale}/dashboard`;
}

/** Start a new manuscript submission. */
export function newSubmissionPageUrl(
  baseUrl: string,
  emailLocale: string | undefined,
): string {
  const root = stripAppBaseUrl(baseUrl);
  const locale = folioUiLocale(emailLocale);
  return `${root}/${locale}/submissions/new`;
}

/** Complete researcher profile after ORCID sign-up. */
export function completeProfilePageUrl(
  baseUrl: string,
  emailLocale: string | undefined,
): string {
  const root = stripAppBaseUrl(baseUrl);
  const locale = folioUiLocale(emailLocale);
  return `${root}/${locale}/complete-profile`;
}

export type OrcidAuthErrorCode =
  | 'ORCID_STATE_INVALID'
  | 'ORCID_EMAIL_EXISTS'
  | 'ORCID_ALREADY_LINKED'
  | 'ORCID_UNAVAILABLE'
  | 'ORCID_DISABLED';

/** Login/register with ORCID error query param. */
export function orcidAuthErrorPageUrl(
  baseUrl: string,
  emailLocale: string | undefined,
  error: OrcidAuthErrorCode,
): string {
  const root = stripAppBaseUrl(baseUrl);
  const locale = folioUiLocale(emailLocale);
  return `${root}/${locale}/login?orcid_error=${encodeURIComponent(error)}`;
}

/** Password reset form (magic link lands here with token query param). */
export function resetPasswordPageUrl(
  baseUrl: string,
  emailLocale: string | undefined,
  token: string,
): string {
  const root = stripAppBaseUrl(baseUrl);
  const locale = folioUiLocale(emailLocale);
  const encoded = encodeURIComponent(token);
  return `${root}/${locale}/reset-password?token=${encoded}`;
}

/** Review workbench after the reviewer has accepted. */
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
