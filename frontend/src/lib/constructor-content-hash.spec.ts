import { describe, expect, it } from 'vitest';
import { canonicalConstructorContentJson } from '@folio/shared/compose/canonical-json';
import { hashConstructorContent } from '@/lib/constructor-content-hash';

describe('hashConstructorContent', () => {
  it('returns matching hashes for reordered constructor objects', async () => {
    const a = {
      defaultDir: 'ltr',
      sections: [{ id: 't1', kind: 'title', text: 'Hello' }],
    };
    const b = {
      sections: [{ text: 'Hello', kind: 'title', id: 't1' }],
      defaultDir: 'ltr',
    };
    await expect(hashConstructorContent(a)).resolves.toBe(
      await hashConstructorContent(b),
    );
  });

  it('uses canonical JSON from shared package', async () => {
    const content = { defaultDir: 'ltr', sections: [] };
    const canonical = canonicalConstructorContentJson(content);
    const hash = await hashConstructorContent(content);
    expect(canonical).toBeTruthy();
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
