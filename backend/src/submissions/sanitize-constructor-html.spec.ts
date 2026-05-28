import {
  CONSTRUCTOR_TIPTAP_ALLOWED_TAGS,
  sanitizeConstructorContent,
  sanitizeConstructorTipTapHtml,
} from './sanitize-constructor-html';
import type { ConstructorContent } from './constructor-content.types';

const BACKEND_BUILD_PARAGRAPH_TAGS = [
  'p',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'sup',
  'sub',
  'a',
  'ul',
  'ol',
  'li',
  'br',
];

describe('sanitizeConstructorTipTapHtml', () => {
  it('matches docx buildParagraph allowlist', () => {
    expect([...CONSTRUCTOR_TIPTAP_ALLOWED_TAGS].sort()).toEqual(
      [...BACKEND_BUILD_PARAGRAPH_TAGS].sort(),
    );
  });

  it('preserves benign TipTap HTML', () => {
    const input = '<p>Hello <strong>world</strong></p>';
    expect(sanitizeConstructorTipTapHtml(input)).toContain('Hello');
    expect(sanitizeConstructorTipTapHtml(input)).toContain('strong');
  });

  it('returns empty paragraph for blank input', () => {
    expect(sanitizeConstructorTipTapHtml('')).toBe('<p></p>');
    expect(sanitizeConstructorTipTapHtml('<p></p>')).toBe('<p></p>');
    expect(sanitizeConstructorTipTapHtml('<p><br></p>')).toBe('<p></p>');
  });

  it('strips script, handlers, and dangerous tags', () => {
    expect(sanitizeConstructorTipTapHtml('<img src=x onerror=alert(1)>')).toBe(
      '<p></p>',
    );
    expect(sanitizeConstructorTipTapHtml('<p onclick="alert(1)">x</p>')).toBe(
      '<p>x</p>',
    );
    expect(
      sanitizeConstructorTipTapHtml('<script>alert(1)</script><p>ok</p>'),
    ).toBe('<p>ok</p>');
    expect(
      sanitizeConstructorTipTapHtml('<a href="javascript:alert(1)">x</a>'),
    ).toBe('x');
    expect(
      sanitizeConstructorTipTapHtml(
        '<a href="https://example.org">link</a>',
      ),
    ).toContain('href="https://example.org/"');
    expect(sanitizeConstructorTipTapHtml('<p>H<sub>2</sub>O</p>')).toContain(
      'sub',
    );
    expect(sanitizeConstructorTipTapHtml('<svg onload=alert(1)>')).toBe(
      '<p></p>',
    );
    expect(
      sanitizeConstructorTipTapHtml('<p><img src=x onerror=alert(1)>text</p>'),
    ).toBe('<p>text</p>');
  });
});

describe('sanitizeConstructorContent', () => {
  it('sanitizes paragraph and rich-text html only', () => {
    const content: ConstructorContent = {
      defaultDir: 'ltr',
      sections: [
        {
          id: 'h1',
          kind: 'heading1',
          text: 'Title',
        },
        {
          id: 'p1',
          kind: 'paragraph',
          html: '<script>x</script><p>ok</p>',
        },
        {
          id: 'ack',
          kind: 'acknowledgments',
          html: '<p onclick="a()">Thanks</p>',
        },
        {
          id: 'eq',
          kind: 'equation',
          latex: 'x^2',
          numbered: false,
        },
      ],
    };
    const out = sanitizeConstructorContent(content)!;
    expect(out.sections[0]).toEqual(content.sections[0]);
    expect((out.sections[1] as { html: string }).html).toBe('<p>ok</p>');
    expect((out.sections[2] as { html: string }).html).toBe('<p>Thanks</p>');
    expect(out.sections[3]).toEqual(content.sections[3]);
  });

  it('returns null for nullish input', () => {
    expect(sanitizeConstructorContent(null)).toBeNull();
    expect(sanitizeConstructorContent(undefined)).toBeNull();
  });
});
