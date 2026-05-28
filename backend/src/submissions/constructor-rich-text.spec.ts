import {
  constructorHtmlToPlain,
  referenceEntryHasContent,
  resolveReferenceEntryHtml,
  sanitizeConstructorLinkHref,
} from './constructor-rich-text';

describe('constructor-rich-text', () => {
  it('sanitizes allowed link hrefs', () => {
    expect(sanitizeConstructorLinkHref('https://example.com/x')).toBe(
      'https://example.com/x',
    );
    expect(sanitizeConstructorLinkHref('mailto:a@b.co')).toBe('mailto:a@b.co');
    expect(sanitizeConstructorLinkHref('javascript:alert(1)')).toBeNull();
  });

  it('migrates legacy reference text to html', () => {
    const html = resolveReferenceEntryHtml({
      text: 'Doe, J. (2020). Example title.',
    });
    expect(html).toContain('<p>');
    expect(html).toContain('Example title');
    expect(referenceEntryHasContent({ text: 'Hello' })).toBe(true);
    expect(referenceEntryHasContent({ html: '<p></p>' })).toBe(false);
  });

  it('strips html to plain text', () => {
    expect(constructorHtmlToPlain('<p>Hi <strong>there</strong></p>')).toBe(
      'Hi there',
    );
  });
});
