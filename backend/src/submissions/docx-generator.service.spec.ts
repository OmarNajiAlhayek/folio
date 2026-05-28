import JSZip from 'jszip';
import { DocxGeneratorService } from './docx-generator.service';
import { EquationRenderService } from './equation-render.service';
import type { ConstructorContent } from './constructor-content.types';
import { validateConstructorContentForSubmit } from './constructor-content-utils';
import { damascusUniversityJournalV1 } from '../manuscript-styles/profiles/damascus-university-journal-v1.profile';
import { extractDocumentXml } from './ooxml-docx.test-utils';

describe('DocxGeneratorService', () => {
  const service = new DocxGeneratorService(new EquationRenderService());

  /**
   * Minimal end-to-end: build a tiny ConstructorContent with mixed RTL/LTR,
   * a heading, an abstract pair, a paragraph, a table, and references; then
   * unzip the resulting `.docx` and assert on OOXML in `word/document.xml`.
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
          html: '<p>This is <strong>bold</strong> and <em>italic</em> with <a href="https://example.com">a link</a>.</p>',
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
            {
              lang: 'en',
              html: '<p>Doe, J. (2020). <em>Example</em>.</p>',
              doi: '10.1/abc',
            },
            { lang: 'ar', html: '<p>الدوسري، س. (2020). نموذج.</p>' },
          ],
        },
      ],
    };

    const buffer = await service.generate(
      content,
      async () => null,
      damascusUniversityJournalV1,
    );

    const docXml = await extractDocumentXml(buffer);

    expect(docXml).toContain('w:val="Heading1"');
    expect(docXml).toContain('w:val="Heading2"');
    expect(docXml).toContain('TableCaption');
    expect(docXml).toMatch(/<w:bidi\s*\/>/);
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
          items: [{ lang: 'en', html: '<p>A reference.</p>' }],
        },
      ],
    };
    expect(validateConstructorContentForSubmit(valid)).toEqual([]);
  });

  it('embeds a full typeset equation PNG in the docx (not a clipped band)', async () => {
    const content: ConstructorContent = {
      defaultDir: 'ltr',
      sections: [
        { id: 't', kind: 'title', text: 'Equation doc' },
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
        { id: 'eq', kind: 'equation', latex: 'E = mc^2', numbered: true },
        {
          id: 'r',
          kind: 'references',
          items: [{ lang: 'en', html: '<p>Ref.</p>' }],
        },
      ],
    };

    const buffer = await service.generate(
      content,
      async () => null,
      damascusUniversityJournalV1,
    );
    const zip = await JSZip.loadAsync(buffer);
    const mediaKeys = Object.keys(zip.files).filter(
      (k) => k.startsWith('word/media/') && k.endsWith('.png'),
    );
    expect(mediaKeys.length).toBeGreaterThanOrEqual(1);
    const png = await zip.file(mediaKeys[0]!)!.async('nodebuffer');
    expect(png.length).toBeGreaterThan(2000);
    const docXml = await extractDocumentXml(buffer);
    expect(docXml).not.toContain('[Equation:');
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
