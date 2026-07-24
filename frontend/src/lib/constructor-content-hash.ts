import { canonicalConstructorContentJson } from '@folio/shared/compose/canonical-json';

export async function hashConstructorContent(
  content: unknown,
): Promise<string | null> {
  const canonical = canonicalConstructorContentJson(content);
  if (!canonical) return null;
  const data = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
