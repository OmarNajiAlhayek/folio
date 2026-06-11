/** Canonical ORCID iD: 0000-0000-0000-000X */
const ORCID_PATTERN = /^(\d{4}-){3}\d{3}[\dX]$/;

export function normalizeOrcidId(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  if (!ORCID_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function orcidUriToId(uri: string): string | null {
  const match = uri.match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i);
  if (!match?.[1]) {
    return null;
  }
  return normalizeOrcidId(match[1]);
}
