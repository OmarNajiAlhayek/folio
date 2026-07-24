import {
  canonicalConstructorContentJson,
  canonicalJsonStringify,
} from './canonical-json';

describe('canonicalJsonStringify', () => {
  it('sorts object keys for stable output', () => {
    expect(canonicalJsonStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('handles nested objects and arrays', () => {
    const value = {
      sections: [
        { id: 'b', kind: 'title' },
        { id: 'a', kind: 'abstract' },
      ],
      defaultDir: 'ltr',
    };
    const once = canonicalJsonStringify(value);
    const reordered = canonicalJsonStringify({
      defaultDir: 'ltr',
      sections: [
        { kind: 'title', id: 'b' },
        { kind: 'abstract', id: 'a' },
      ],
    });
    expect(once).toBe(reordered);
  });
});

describe('canonicalConstructorContentJson', () => {
  it('returns null for empty or non-object input', () => {
    expect(canonicalConstructorContentJson(null)).toBeNull();
    expect(canonicalConstructorContentJson('text')).toBeNull();
  });

  it('returns canonical JSON for constructor-like objects', () => {
    const json = canonicalConstructorContentJson({
      defaultDir: 'ltr',
      sections: [{ id: 't1', kind: 'title', text: 'Hello' }],
    });
    expect(json).toContain('"defaultDir":"ltr"');
    expect(json).toContain('"sections"');
  });
});
