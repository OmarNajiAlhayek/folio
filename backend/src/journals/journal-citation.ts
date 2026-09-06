/**
 * Issue citation vocabulary. Arabic academic practice cites **العدد، السنة**;
 * المجلد is optional and stays out of the public label even when stored.
 *
 * The frontend renders these through next-intl, but emails, exports and the
 * Swagger examples need a server-side rendering of the same strings — keep the
 * two in sync with `frontend/messages/{ar,en}.json`.
 */
export type IssueCitationParts = {
  year: number;
  number: number;
  volume?: number | null;
};

/** `العدد 3، 2026` */
export function issueCitationAr({ year, number }: IssueCitationParts): string {
  return `العدد ${number}، ${year}`;
}

/** `No. 3 (2026)` */
export function issueCitationEn({ year, number }: IssueCitationParts): string {
  return `No. ${number} (${year})`;
}

/** Staff-facing form that surfaces المجلد when the issue carries one. */
export function issueCitationWithVolumeAr(parts: IssueCitationParts): string {
  return parts.volume != null
    ? `المجلد ${parts.volume}، ${issueCitationAr(parts)}`
    : issueCitationAr(parts);
}

export function issueCitationWithVolumeEn(parts: IssueCitationParts): string {
  return parts.volume != null
    ? `Vol. ${parts.volume} ${issueCitationEn(parts)}`
    : issueCitationEn(parts);
}

export function issueCitation(
  locale: string,
  parts: IssueCitationParts,
): string {
  return locale.startsWith('ar')
    ? issueCitationAr(parts)
    : issueCitationEn(parts);
}
