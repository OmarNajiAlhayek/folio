/* eslint-disable @typescript-eslint/require-await */
import JSZip from 'jszip';
import { mathJaxReady } from '@micromatrix.org/docx-math-converter';
import {
  DocxGeneratorService,
  authorSurname,
  splitTextByScript,
} from './docx-generator.service';
import { EquationRenderService } from './equation-render.service';
import { EquationOmmlService } from './equation-omml.service';
import type {
  ConstructorContent,
  ConstructorDir,
} from './constructor-content.types';
import { validateConstructorContentForSubmit } from './constructor-content-utils';
import { checkDocxFormat } from './docx-format-checker';
import { damascusUniversityJournalV1 } from '../manuscript-styles/profiles/damascus-university-journal-v1.profile';
import { extractDocumentXml } from './ooxml-docx.test-utils';

async function headerFooterTexts(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((n) =>
    /^word\/(header|footer)\d+\.xml$/.test(n),
  );
  return Promise.all(
    names.map(async (n) =>
      (await zip.file(n)!.async('string'))
        .replace(/<w:instrText[^>]*>([^<]*)<\/w:instrText>/g, '{$1}')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    ),
  );
}

const sectPr = (xml: string) => /<w:sectPr\b[\s\S]*?<\/w:sectPr>/.exec(xml)![0];

const AR_BODY =
  'تتناول هذه المقالة الاتجاهات الوالدية وأثرها في السلوك الاجتماعي للأطفال، وقد رأى Gessler (2020) أن العوامل البيئية مهمة.';
const EN_BODY =
  'This article examines parental attitudes and their effect on the social behaviour of children in late childhood.';

/** A complete Damascus article; `dir` is the article language. */
function damascusArticle(dir: ConstructorDir): ConstructorContent {
  const rtl = dir === 'rtl';
  const body = rtl ? AR_BODY : EN_BODY;
  return {
    // Drafts were created with the old left-to-right default whatever their language.
    defaultDir: 'ltr',
    sections: [
      {
        id: 'te',
        kind: 'title',
        lang: 'en',
        text: 'Parental Attitudes And Social Behaviour',
      },
      {
        id: 'ta',
        kind: 'title',
        lang: 'ar',
        text: 'الاتجاهات الوالدية والسلوك الاجتماعي',
      },
      {
        id: 'au',
        kind: 'authors',
        authors: [
          {
            fullName: 'محمد عبد الوهاب',
            title: 'د.',
            affiliation: 'كلية التربية، جامعة دمشق',
            specialization: 'علم نفس النمو',
            email: 'm.wahab@damascusuniversity.edu.sy',
            isCorresponding: true,
          },
          {
            fullName: 'رشا السعيد',
            title: 'أ.د.',
            affiliation: 'كلية التربية، جامعة دمشق',
            email: 'r.saeed@damascusuniversity.edu.sy',
            isCorresponding: false,
          },
        ],
      },
      {
        id: 'ae',
        kind: 'abstract',
        lang: 'en',
        text: EN_BODY,
        keywords: 'Attitudes, Parents, Children, Behaviour, Childhood',
      },
      {
        id: 'aa',
        kind: 'abstract',
        lang: 'ar',
        text: AR_BODY,
        keywords: 'الاتجاهات، الوالدين، الأطفال، السلوك، الطفولة',
      },
      {
        id: 'h1',
        kind: 'heading1',
        dir,
        text: rtl ? 'المقدمة' : 'Introduction',
      },
      {
        id: 'p1',
        kind: 'paragraph',
        dir,
        html: `<p>${body}</p><p>${body}</p>`,
      },
      {
        id: 'tbl',
        kind: 'table',
        dir,
        caption: rtl ? 'نتيجة التجربة الأولى' : 'First experiment result',
        hasHeaderRow: true,
        rows: [
          ['A', 'B'],
          ['1', '2'],
        ],
        notes: 'حيث إن: م المتوسط',
      },
      {
        id: 'img',
        kind: 'image',
        dir,
        fileId: null,
        altText: '',
        caption: rtl ? 'شكل للنتيجة' : 'Result plot',
      },
      {
        id: 'h2',
        kind: 'heading1',
        dir,
        text: rtl ? 'الاستنتاجات' : 'Conclusions',
      },
      { id: 'p2', kind: 'paragraph', dir, html: `<ol><li>${body}</li></ol>` },
      {
        id: 'r',
        kind: 'references',
        items: [
          {
            lang: 'en',
            html: '<p>Herbst, H. (2019). <em>Volunteer support</em>. Health Psychology, 24, 255-299.</p>',
            doi: '10.21608/abc',
          },
          {
            lang: 'ar',
            html: '<p>الجابري، محمد عابد. (2001). <em>العقل الأخلاقي العربي</em>. مركز دراسات الوحدة العربية.</p>',
          },
        ],
      },
    ],
  };
}

describe('DocxGeneratorService', () => {
  const equationRender = new EquationRenderService();
  const equationOmml = new EquationOmmlService(equationRender);
  const service = new DocxGeneratorService(equationOmml);
  const profile = damascusUniversityJournalV1;
  const generate = (
    content: ConstructorContent,
    journal?: Parameters<DocxGeneratorService['generate']>[3],
  ) => service.generate(content, async () => null, profile, journal);

  beforeAll(async () => {
    await mathJaxReady();
    await equationOmml.onModuleInit();
  });

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

    const docXml = await extractDocumentXml(await generate(content));

    expect(docXml).toContain('w:val="Title"');
    expect(docXml).toContain('w:val="Heading1"');
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

  it('embeds native OMML equation markup in the docx', async () => {
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
    const docXml = await extractDocumentXml(await generate(content));
    expect(docXml).toContain('m:oMath');
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

  describe('Damascus University Journal template', () => {
    it.each(['rtl', 'ltr'] as const)(
      'produces a %s article that passes the upload format check untouched',
      async (dir) => {
        const buffer = await generate(damascusArticle(dir));
        expect(await checkDocxFormat(buffer, profile)).toEqual([]);
      },
    );

    it('numbers lines continuously — on the left for Arabic, on the right for English', async () => {
      const arabic = sectPr(
        await extractDocumentXml(await generate(damascusArticle('rtl'))),
      );
      expect(arabic).toMatch(/<w:lnNumType[^>]*w:restart="continuous"/);
      expect(arabic).toMatch(/<w:lnNumType[^>]*w:distance="255"/);
      expect(arabic).toContain('<w:titlePg/>');
      expect(arabic).not.toContain('<w:bidi/>');

      const english = sectPr(
        await extractDocumentXml(await generate(damascusArticle('ltr'))),
      );
      expect(english).toContain('<w:bidi/>');
    });

    it('lays out the article language on page 1, the other on page 2 and the body from page 3', async () => {
      const arabic = await extractDocumentXml(
        await generate(damascusArticle('rtl')),
      );
      expect(arabic.match(/w:type="page"/g)).toHaveLength(2);
      const arTitle = arabic.indexOf('الاتجاهات الوالدية والسلوك الاجتماعي');
      const enTitle = arabic.indexOf('Parental Attitudes And Social Behaviour');
      const [firstBreak, secondBreak] = [
        ...arabic.matchAll(/w:type="page"/g),
      ].map((m) => m.index);
      expect(arTitle).toBeLessThan(firstBreak);
      expect(enTitle).toBeGreaterThan(firstBreak);
      expect(enTitle).toBeLessThan(secondBreak);
      expect(arabic.indexOf('المقدمة')).toBeGreaterThan(secondBreak);

      const english = await extractDocumentXml(
        await generate(damascusArticle('ltr')),
      );
      expect(
        english.indexOf('Parental Attitudes And Social Behaviour'),
      ).toBeLessThan(english.indexOf('الاتجاهات الوالدية والسلوك الاجتماعي'));
    });

    it('prints the journal header on page 1 and title with author surnames on later pages', async () => {
      const withJournal = await headerFooterTexts(
        await generate(damascusArticle('rtl'), {
          journal: {
            titleAr: 'مجلة جامعة دمشق للعلوم التربوية',
            titleEn: 'Damascus University Journal of Educational Sciences',
            eissn: '2789-7214',
          },
        }),
      );
      expect(withJournal).toEqual(
        expect.arrayContaining([
          expect.stringContaining('مجلة جامعة دمشق للعلوم التربوية'),
          expect.stringContaining(
            'الاتجاهات الوالدية والسلوك الاجتماعي عبد الوهاب، السعيد',
          ),
          expect.stringMatching(
            /\{ ?PAGE ?\} من \{ ?NUMPAGES ?\} ISSN: 2789-7214 \(online\)/,
          ),
          expect.stringMatching(/^\{ ?PAGE ?\} من \{ ?NUMPAGES ?\}$/),
        ]),
      );

      const placeholders = await headerFooterTexts(
        await generate(damascusArticle('rtl')),
      );
      expect(placeholders.join('\n')).toContain('مجلة جامعة دمشق للعلوم ....');
      expect(placeholders.join('\n')).toContain('V… ( ):PP: ??-??');
      expect(placeholders.join('\n')).toContain('ISSN (online)');
    });

    describe('reference list order by the journal citation style', () => {
      const withRefs = (): ConstructorContent => ({
        ...damascusArticle('ltr'),
        sections: [
          ...damascusArticle('ltr').sections.filter(
            (s) => s.kind !== 'references',
          ),
          {
            id: 'r',
            kind: 'references',
            items: [
              { lang: 'en', html: '<p>Zulu Z. First cited.</p>' },
              { lang: 'ar', html: '<p>باسل ب. المرجع الثاني.</p>' },
              { lang: 'en', html: '<p>Alpha A. Third cited.</p>' },
            ],
          },
        ],
      });
      const order = (xml: string) =>
        ['Zulu', 'باسل', 'Alpha'].sort(
          (a, b) => xml.indexOf(a) - xml.indexOf(b),
        );

      it('APA journals sort alphabetically, Arabic entries first', async () => {
        const xml = await extractDocumentXml(
          await generate(withRefs(), {
            journal: { disciplineLabel: 'العلوم الهندسية' },
          }),
        );
        expect(order(xml)).toEqual(['باسل', 'Alpha', 'Zulu']);
      });

      it('the medical journal (Vancouver) keeps the author order of first citation', async () => {
        const xml = await extractDocumentXml(
          await generate(withRefs(), {
            journal: { disciplineLabel: 'العلوم الطبية' },
          }),
        );
        expect(order(xml)).toEqual(['Zulu', 'باسل', 'Alpha']);
      });

      it('falls back to APA when the journal is unknown', async () => {
        const xml = await extractDocumentXml(await generate(withRefs()));
        expect(order(xml)).toEqual(['باسل', 'Alpha', 'Zulu']);
      });
    });

    it('prefixes authors with their title and marks affiliations and the corresponding author', async () => {
      const xml = await extractDocumentXml(
        await generate(damascusArticle('rtl')),
      );
      expect(xml).toMatch(/د\. محمد عبد الوهاب<\/w:t>/);
      expect(xml).toMatch(
        /<w:vertAlign w:val="superscript"\/>[\s\S]{0,200}?<w:t xml:space="preserve">1\*<\/w:t>/,
      );
      expect(xml).toContain('علم نفس النمو');
    });

    it('floats the dates and CC BY-NC-SA box on the start side of each language block', async () => {
      const buffer = await generate(damascusArticle('rtl'));
      const xml = await extractDocumentXml(buffer);
      const floats = [...xml.matchAll(/<w:tblpPr[^>]*w:tblpX="(\d+)"/g)].map(
        (m) => Number(m[1]),
      );
      expect(floats).toHaveLength(2);
      expect(floats[0]).toBeGreaterThan(8000); // Arabic block: right side
      expect(floats[1]).toBeLessThan(1000); // English block: left side
      expect(xml).toContain('تاريخ الإيداع');
      expect(xml).toContain('Received:');
      const zip = await JSZip.loadAsync(buffer);
      expect(
        Object.keys(zip.files).some((n) => /^word\/media\/.+\.png$/.test(n)),
      ).toBe(true);
    });

    it('captions tables and figures as "الجدول (1)" and "Table (1)" at 10 pt bold', async () => {
      const arabic = await extractDocumentXml(
        await generate(damascusArticle('rtl')),
      );
      expect(arabic).toContain('الجدول (1) نتيجة التجربة الأولى');
      expect(arabic).toContain('الشكل (1) شكل للنتيجة');
      expect(arabic).toMatch(
        /<w:b\/><w:bCs\/><w:sz w:val="20"\/><w:szCs w:val="20"\/><w:rtl\/><\/w:rPr><w:t xml:space="preserve">الجدول/,
      );

      const english = await extractDocumentXml(
        await generate(damascusArticle('ltr')),
      );
      expect(english).toContain('Table (1) First experiment result');
      expect(english).toContain('Figure (1) Result plot');
    });

    it('rules tables with horizontal lines only', async () => {
      const xml = await extractDocumentXml(
        await generate(damascusArticle('rtl')),
      );
      const borders = xml
        .match(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/g)!
        .pop()!;
      expect(borders).toMatch(/<w:top w:val="single"[^>]*w:sz="12"/);
      expect(borders).toMatch(/<w:insideH w:val="single"/);
      expect(borders).toMatch(/<w:insideV w:val="none"/);
      expect(borders).toMatch(/<w:left w:val="none"/);
      expect(xml).not.toContain('w:fill="EEEEEE"');
    });

    it('numbers the reference list with Arabic entries first under a heading in the article language', async () => {
      const xml = await extractDocumentXml(
        await generate(damascusArticle('rtl')),
      );
      const refsStart = xml.lastIndexOf('المراجع');
      expect(refsStart).toBeGreaterThan(0);
      const refs = xml.slice(refsStart);
      expect(refs.indexOf('الجابري')).toBeLessThan(refs.indexOf('Herbst'));
      expect(refs.match(/<w:numPr>/g)).toHaveLength(2);
      expect(refs).toContain('https://doi.org/10.21608/abc');

      const english = await extractDocumentXml(
        await generate(damascusArticle('ltr')),
      );
      expect(english).toContain('>References<');
    });

    it('sets Latin words inside Arabic text in their own Times New Roman 11 run', async () => {
      const xml = await extractDocumentXml(
        await generate(damascusArticle('rtl')),
      );
      const run = /<w:r>(?:(?!<\/w:r>)[\s\S])*?>Gessler<\/w:t><\/w:r>/.exec(
        xml,
      )![0];
      expect(run).not.toContain('<w:rtl/>');
      expect(run).toContain('<w:sz w:val="22"/>');
      expect(xml).toMatch(/<w:sz w:val="22"\/><w:szCs w:val="24"\/><w:rtl\/>/);
    });

    it('does not insert an empty paragraph before paragraph sections', async () => {
      const xml = await extractDocumentXml(
        await generate(damascusArticle('rtl')),
      );
      const afterHeading = xml.slice(xml.indexOf('المقدمة'));
      const nextParagraph = /<\/w:p>\s*(<w:p>[\s\S]*?<\/w:p>)/.exec(
        afterHeading,
      )![1];
      expect(nextParagraph).toContain('تتناول');
    });
  });

  describe('splitTextByScript', () => {
    it('gives Latin words their own run inside Arabic text', () => {
      expect(splitTextByScript('رأى Gessler (2020) أن', true)).toEqual([
        { text: 'رأى ', rtl: true },
        { text: 'Gessler', rtl: false },
        { text: ' (2020) أن', rtl: true },
      ]);
    });

    it('keeps neutrals between words of the same script inside that run', () => {
      // Trailing neutrals sit before the paragraph end, so they take its direction.
      expect(splitTextByScript('Grass et al., 2022', true)).toEqual([
        { text: 'Grass et al', rtl: false },
        { text: '., 2022', rtl: true },
      ]);
      expect(splitTextByScript('Hello, world.', false)).toEqual([
        { text: 'Hello, world.', rtl: false },
      ]);
    });

    it('returns nothing for empty text', () => {
      expect(splitTextByScript('', true)).toEqual([]);
    });
  });

  describe('authorSurname', () => {
    it.each([
      ['محمد عابد الجابري', 'الجابري'],
      ['محمد عبد الوهاب', 'عبد الوهاب'],
      ['سليمى أبو الحسن', 'أبو الحسن'],
      ['John A. Smith', 'Smith'],
      ['Jan van Dijk', 'van Dijk'],
      ['Ahmad', 'Ahmad'],
      ['', ''],
    ])('%s → %s', (name, surname) => {
      expect(authorSurname(name)).toBe(surname);
    });
  });
});
