import JSZip from 'jszip';
import { DocxGeneratorService } from './docx-generator.service';
import type { ConstructorContent } from './constructor-content.types';
import { validateConstructorContentForSubmit } from './constructor-content-utils';

describe('DocxGeneratorService', () => {
  const service = new DocxGeneratorService();

  /**
   * Minimal end-to-end: build a tiny ConstructorContent with mixed RTL/LTR,
   * a heading, an abstract pair, a paragraph, a table, and references; then
   * unzip the resulting `.docx` and assert that the expected named styles
   * and `w:bidi` toggles appear in `word/document.xml`.
   */
  it('emits a .docx whose document.xml carries the expected styles & RTL', async () => {
    const content: ConstructorContent = {
      defaultDir: 'ltr',
      sections: [
        { id: 't', kind: 'title', text: 'A Test Manuscript' },
        {
          id: 'a-en',
          kind: 'abstract',
          lang: 'en',
          text: 'Short English abstract.',
          keywords: 'one, two',
        },
        {
          id: 'a-ar',
          kind: 'abstract',
          lang: 'ar',
          text: 'ملخص قصير باللغة العربية.',
          keywords: 'واحد، اثنان',
        },
        { id: 'h', kind: 'heading1', text: 'Introduction' },
        {
          id: 'p',
          kind: 'paragraph',
          html: '<p>This is <strong>bold</strong> and <em>italic</em>.</p>',
        },
        {
          id: 'tbl',
          kind: 'table',
          caption: 'Sample Table',
          hasHeaderRow: true,
          rows: [
            ['Header A', 'Header B'],
            ['Cell 1', 'Cell 2'],
          ],
        },
        {
          id: 'r',
          kind: 'references',
          items: [
            { lang: 'en', text: 'Doe, J. (2020). Example.', doi: '10.1/abc' },
            { lang: 'ar', text: 'الدوسري، س. (2020). نموذج.' },
          ],
        },
      ],
    };

    const buffer = await service.generate(content, async () => null);

    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file('word/document.xml')!.async('string');

    expect(docXml).toContain('w:val="Heading1"');
    expect(docXml).toContain('w:val="Heading2"');
    // Caption styles defined in buildStyles(); a TableCaption paragraph
    // must appear because we passed a TableSection above.
    expect(docXml).toContain('TableCaption');
    // RTL coverage: at least one paragraph carries `<w:bidi/>` (no `w:val="false"`)
    // for the Arabic abstract section.
    expect(docXml).toMatch(/<w:bidi\s*\/>/);
    // Inline marks survive the parse5 → docx mapping
    expect(docXml).toContain('<w:b/>');
    expect(docXml).toContain('<w:i/>');
  });

  it('returns 0 errors for a valid minimal content', () => {
    const valid: ConstructorContent = {
      defaultDir: 'ltr',
      sections: [
        { id: 't', kind: 'title', text: 'Hello' },
        {
          id: 'a-en',
          kind: 'abstract',
          lang: 'en',
          text: 'Abstract.',
          keywords: '',
        },
        {
          id: 'a-ar',
          kind: 'abstract',
          lang: 'ar',
          text: 'ملخص.',
          keywords: '',
        },
        {
          id: 'r',
          kind: 'references',
          items: [{ lang: 'en', text: 'A reference.' }],
        },
      ],
    };
    expect(validateConstructorContentForSubmit(valid)).toEqual([]);
  });

  it('reports missing title and missing references', () => {
    const errs = validateConstructorContentForSubmit({
      defaultDir: 'ltr',
      sections: [],
    });
    const codes = errs.map((e) => e.code);
    expect(codes).toContain('CONSTRUCTOR_TITLE_MISSING');
    expect(codes).toContain('CONSTRUCTOR_ABSTRACT_EN_MISSING');
    expect(codes).toContain('CONSTRUCTOR_ABSTRACT_AR_MISSING');
    expect(codes).toContain('CONSTRUCTOR_REFERENCES_MISSING');
  });
});
