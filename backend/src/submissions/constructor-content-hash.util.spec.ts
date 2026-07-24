import { createHash } from 'crypto';
import { canonicalConstructorContentJson } from '@folio/shared/constructor/canonical-json';
import type { ConstructorContent } from './constructor-content.types';
import { hashConstructorContent } from './constructor-content-hash.util';

describe('hashConstructorContent', () => {
  const sample = {
    defaultDir: 'ltr',
    sections: [{ id: 't1', kind: 'title', text: 'Hello' }],
  } as ConstructorContent;

  it('returns null for empty content', () => {
    expect(hashConstructorContent(null)).toBeNull();
    expect(hashConstructorContent(undefined)).toBeNull();
  });

  it('returns stable sha256 hex for constructor content', () => {
    const canonical = canonicalConstructorContentJson(sample);
    const expected = createHash('sha256').update(canonical!).digest('hex');
    expect(hashConstructorContent(sample)).toBe(expected);
  });

  it('matches hash regardless of object key order', () => {
    const a = {
      defaultDir: 'ltr',
      sections: [{ kind: 'title', id: 't1', text: 'Hello' }],
    } as ConstructorContent;
    const b = {
      sections: [{ text: 'Hello', id: 't1', kind: 'title' }],
      defaultDir: 'ltr',
    } as ConstructorContent;
    expect(hashConstructorContent(a)).toBe(hashConstructorContent(b));
  });
});
