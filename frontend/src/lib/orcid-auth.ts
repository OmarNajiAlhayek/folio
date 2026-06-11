import { apiUrl } from '@/lib/api';

export type OrcidAuthMode = 'login' | 'link';

export function startOrcidAuth(opts: {
  mode: OrcidAuthMode;
  locale: string;
  next?: string;
}): void {
  const params = new URLSearchParams({
    mode: opts.mode,
    locale: opts.locale === 'ar' ? 'ar' : 'en',
  });
  if (opts.next) {
    params.set('next', opts.next);
  }
  window.location.assign(`${apiUrl('/auth/orcid')}?${params.toString()}`);
}

export type OrcidAuthErrorCode =
  | 'ORCID_STATE_INVALID'
  | 'ORCID_EMAIL_EXISTS'
  | 'ORCID_ALREADY_LINKED'
  | 'ORCID_UNAVAILABLE'
  | 'ORCID_DISABLED';

export function parseOrcidAuthError(
  raw: string | null | undefined,
): OrcidAuthErrorCode | null {
  const codes: OrcidAuthErrorCode[] = [
    'ORCID_STATE_INVALID',
    'ORCID_EMAIL_EXISTS',
    'ORCID_ALREADY_LINKED',
    'ORCID_UNAVAILABLE',
    'ORCID_DISABLED',
  ];
  if (!raw) return null;
  return codes.includes(raw as OrcidAuthErrorCode)
    ? (raw as OrcidAuthErrorCode)
    : null;
}
