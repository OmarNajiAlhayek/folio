import { createHash } from 'crypto';
import { canonicalConstructorContentJson } from '@folio/shared/constructor/canonical-json';
import type { ConstructorContent } from './constructor-content.types';

export function hashConstructorContent(
  content: ConstructorContent | null | undefined,
): string | null {
  const canonical = canonicalConstructorContentJson(content);
  if (!canonical) return null;
  return createHash('sha256').update(canonical).digest('hex');
}
