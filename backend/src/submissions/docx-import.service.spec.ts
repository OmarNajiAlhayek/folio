import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mammoth from 'mammoth';
import { DocxImportService } from './docx-import.service';
import type {
  AbstractSection,
  AuthorsSection,
  TitleSection,
  TableSection,
} from './constructor-content.types';
import {
  CONSTRUCTOR_IMPORT_BACK_MATTER_UNCERTAIN,
  CONSTRUCTOR_IMPORT_EQUATION_LOST,
  CONSTRUCTOR_IMPORT_MAMMOTH_NOTES,
  CONSTRUCTOR_IMPORT_NO_CONTENT,
} from './docx-import-warning-codes';

jest.mock('mammoth', () => ({
  __esModule: true,
  default: { convertToHtml: jest.fn() },
}));

const convertToHtml = mammoth.convertToHtml as jest.Mock;

// Minimal valid ZIP/OOXML header that passes the MIME sniff
const validZipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mockHtml(
  html: string,
  messages: { type: string; message: string }[] = [],
) {
  convertToHtml.mockResolvedValue({ value: html, messages });
}

function warn(msg: string) {
  return { type: 'warning', message: msg };
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

describe('DocxImportService', () => {
  let service: DocxImportService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [DocxImportService],
    }).compile();
    service = module.get(DocxImportService);
    convertToHtml.mockReset();
  });

  // ─── Buffer / MIME validation ───────────────────────────────────────────────

  describe('buffer validation', () => {
    it('rejects empty buffer', async () => {
      await expect(
        service.importFromBuffer(Buffer.alloc(0)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects buffer too small', async () => {
      await expect(
        service.importFromBuffer(Buffer.from([0x50, 0x4b])),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects PDF magic bytes', async () => {
      await expect(
        service.importFromBuffer(Buffer.from('%PDF-1.4')),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects HTML disguised as docx', async () => {
      await expect(
        service.importFromBuffer(Buffer.from('<html><body></body></html>')),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws CONSTRUCTOR_IMPORT_NO_CONTENT when parse yields no usable sections', async () => {
      mockHtml(
        `<h2>Abstract</h2><h1>References</h1><p><img src="data:image/png;base64,abc" /></p>`,
      );
      await expect(
        service.importFromBuffer(validZipHeader),
      ).rejects.toMatchObject({
        response: { code: CONSTRUCTOR_IMPORT_NO_CONTENT },
      });
    });
  });

  // ─── Title extraction ───────────────────────────────────────────────────────

  describe('title extraction', () => {
    it('maps first h1 as English title', async () => {
      mockHtml(
        `<h1>Effect of Temperature on Enzyme Activity</h1><p>Body paragraph.</p>`,
      );
      const result = await service.importFromBuffer(validZipHeader);
      const title = result.content.sections.find(
        (s): s is TitleSection => s.kind === 'title',
      );
      expect(title?.text).toBe('Effect of Temperature on Enzyme Activity');
      expect(title?.lang).toBe('en');
    });

    it('maps Arabic h1 as Arabic title', async () => {
      mockHtml(`<h1>تأثير الحرارة على نشاط الإنزيم</h1><p>فقرة.</p>`);
      const result = await service.importFromBuffer(validZipHeader);
      const title = result.content.sections.find(
        (s): s is TitleSection => s.kind === 'title',
      );
      expect(title?.lang).toBe('ar');
      expect(title?.text).toContain('تأثير');
    });

    it('maps bilingual document to both English and Arabic titles', async () => {
      mockHtml(`
        <h1>English Title of the Study</h1>
        <h1>عنوان الدراسة بالعربية</h1>
        <p>Body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const titles = result.content.sections.filter(
        (s): s is TitleSection => s.kind === 'title',
      );
      expect(titles).toHaveLength(2);
      expect(titles.some((t) => t.lang === 'en')).toBe(true);
      expect(titles.some((t) => t.lang === 'ar')).toBe(true);
    });

    it('does not create duplicate title sections for repeated identical h1', async () => {
      mockHtml(`<h1>Same Title</h1><h1>Same Title</h1><p>Body.</p>`);
      const result = await service.importFromBuffer(validZipHeader);
      const titles = result.content.sections.filter((s) => s.kind === 'title');
      expect(titles).toHaveLength(1);
    });

    it('third h1 after both titles are filled becomes heading1', async () => {
      mockHtml(`
        <h1>English Title</h1>
        <h1>عنوان عربي</h1>
        <h1>Introduction</h1>
        <p>Body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const intro = result.content.sections.find(
        (s) =>
          s.kind === 'heading1' && 'text' in s && s.text === 'Introduction',
      );
      expect(intro).toBeDefined();
    });
  });

  // ─── Abstract extraction ─────────────────────────────────────────────────────

  describe('abstract extraction', () => {
    it('captures English abstract after Abstract heading', async () => {
      mockHtml(`
        <h1>Sample Article</h1>
        <h2>Abstract</h2>
        <p>This is the abstract text for the article.</p>
        <h2>Introduction</h2>
        <p>Body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const abs = result.content.sections.find(
        (s): s is AbstractSection => s.kind === 'abstract' && s.lang === 'en',
      );
      expect(abs?.text).toContain('abstract text');
    });

    it('captures Arabic abstract after الملخص heading', async () => {
      mockHtml(`
        <h1>Title</h1>
        <h2>الملخص</h2>
        <p>نص الملخص العربي هنا.</p>
        <h2>مقدمة</h2>
        <p>فقرة.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const abs = result.content.sections.find(
        (s): s is AbstractSection => s.kind === 'abstract' && s.lang === 'ar',
      );
      expect(abs?.text).toContain('نص الملخص');
    });

    it('does not leave الملخص as a heading section', async () => {
      mockHtml(`<h1>Title</h1><h2>الملخص</h2><p>نص.</p>`);
      const result = await service.importFromBuffer(validZipHeader);
      expect(
        result.content.sections.some(
          (s) => s.kind === 'heading2' && 'text' in s && s.text === 'الملخص',
        ),
      ).toBe(false);
    });

    it('captures both abstracts in bilingual document', async () => {
      mockHtml(`
        <h1>English Title</h1>
        <h1>عنوان عربي</h1>
        <h2>Abstract</h2>
        <p>English abstract content.</p>
        <h2>الملخص</h2>
        <p>محتوى الملخص العربي.</p>
        <h2>Introduction</h2>
        <p>Body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const en = result.content.sections.find(
        (s): s is AbstractSection => s.kind === 'abstract' && s.lang === 'en',
      );
      const ar = result.content.sections.find(
        (s): s is AbstractSection => s.kind === 'abstract' && s.lang === 'ar',
      );
      expect(en?.text).toContain('English abstract');
      expect(ar?.text).toContain('محتوى الملخص');
    });
  });

  // ─── Keywords extraction ─────────────────────────────────────────────────────

  describe('keywords extraction', () => {
    it('extracts English keywords from "Keywords: ..." paragraph', async () => {
      mockHtml(`
        <h1>Title</h1>
        <h2>Abstract</h2>
        <p>Abstract text goes here.</p>
        <p>Keywords: neural, network, deep, learning, algorithm</p>
        <h2>Introduction</h2>
        <p>Body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const abs = result.content.sections.find(
        (s): s is AbstractSection => s.kind === 'abstract' && s.lang === 'en',
      );
      expect(abs?.keywords).toContain('neural');
      expect(abs?.keywords).toContain('algorithm');
    });

    it('extracts Arabic keywords from الكلمات المفتاحية line', async () => {
      mockHtml(`
        <h1>Title</h1>
        <h2>الملخص</h2>
        <p>نص الملخص العربي.</p>
        <p>الكلمات المفتاحية: شبكة، تعلم، خوارزمية، أداء، تصنيف</p>
        <h2>مقدمة</h2>
        <p>نص.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const abs = result.content.sections.find(
        (s): s is AbstractSection => s.kind === 'abstract' && s.lang === 'ar',
      );
      expect(abs?.keywords).toContain('شبكة');
    });

    it('strips the "Keywords:" label from the keywords string', async () => {
      mockHtml(`
        <h1>Title</h1>
        <h2>Abstract</h2>
        <p>Abstract text.</p>
        <p>Keywords: alpha, beta, gamma</p>
        <h2>Intro</h2><p>Body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const abs = result.content.sections.find(
        (s): s is AbstractSection => s.kind === 'abstract' && s.lang === 'en',
      );
      expect(abs?.keywords).not.toMatch(/^keywords:/i);
      expect(abs?.keywords).toMatch(/alpha/i);
    });
  });

  // ─── Authors extraction ──────────────────────────────────────────────────────

  describe('authors extraction', () => {
    it('parses author name and title from "Name — Title" line', async () => {
      mockHtml(`
        <h1>Sample Article</h1>
        <p>Ada Lovelace — Dr.</p>
        <h2>Abstract</h2>
        <p>Abstract body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const authors = result.content.sections.find(
        (s): s is AuthorsSection => s.kind === 'authors',
      );
      expect(authors?.authors[0]?.fullName).toBe('Ada Lovelace');
      expect(authors?.authors[0]?.title).toBe('Dr.');
    });

    it('detects corresponding author via asterisk (*)', async () => {
      mockHtml(`
        <h1>Title</h1>
        <p>Ada Lovelace* — Dr.</p>
        <p>Analytical Engine University — ada@test.dev</p>
        <h2>Abstract</h2>
        <p>Abstract.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const authors = result.content.sections.find(
        (s): s is AuthorsSection => s.kind === 'authors',
      );
      expect(authors?.authors[0]?.isCorresponding).toBe(true);
    });

    it('strips asterisk from author name', async () => {
      mockHtml(`
        <h1>Title</h1>
        <p>John Smith* — Prof.</p>
        <h2>Abstract</h2>
        <p>Abstract text.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const authors = result.content.sections.find(
        (s): s is AuthorsSection => s.kind === 'authors',
      );
      expect(authors?.authors[0]?.fullName).not.toContain('*');
      expect(authors?.authors[0]?.fullName).toBe('John Smith');
    });

    it('captures affiliation and email from a follow-up line', async () => {
      mockHtml(`
        <h1>Title</h1>
        <p>Ada Lovelace* — Dr.</p>
        <p>Analytical Engine University — ada@damascus.edu.sy</p>
        <h2>Abstract</h2>
        <p>Abstract.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const authors = result.content.sections.find(
        (s): s is AuthorsSection => s.kind === 'authors',
      );
      expect(authors?.authors[0]?.email).toBe('ada@damascus.edu.sy');
      expect(authors?.authors[0]?.affiliation).toBeTruthy();
    });

    it('parses multiple authors', async () => {
      mockHtml(`
        <h1>Title</h1>
        <p>John Smith* — Dr.</p>
        <p>Damascus University — john@damascus.edu.sy</p>
        <p>Jane Doe — Prof.</p>
        <p>Aleppo University — jane@aleppo.edu.sy</p>
        <h2>Abstract</h2>
        <p>Abstract text.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const authors = result.content.sections.find(
        (s): s is AuthorsSection => s.kind === 'authors',
      );
      expect(authors?.authors).toHaveLength(2);
      expect(authors?.authors[0]?.fullName).toContain('John');
      expect(authors?.authors[1]?.fullName).toContain('Jane');
    });

    it('closes author zone when abstract heading is encountered', async () => {
      mockHtml(`
        <h1>Title</h1>
        <p>Ada Lovelace — Dr.</p>
        <p>Some University — ada@test.dev</p>
        <h2>Abstract</h2>
        <p>Abstract text goes here.</p>
        <h2>Introduction</h2>
        <p>Intro body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      // Author lines should NOT appear as body paragraphs
      expect(
        result.content.sections.some(
          (s) =>
            s.kind === 'paragraph' &&
            'html' in s &&
            s.html.includes('Ada Lovelace'),
        ),
      ).toBe(false);
    });
  });

  // ─── Body sections ───────────────────────────────────────────────────────────

  describe('body sections', () => {
    it('maps title, abstract, and body paragraphs correctly', async () => {
      mockHtml(`
        <h1>Sample Article</h1>
        <h2>Abstract</h2>
        <p>Abstract text.</p>
        <h2>Introduction</h2>
        <p>First paragraph of the body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      expect(result.content.sections.some((s) => s.kind === 'title')).toBe(
        true,
      );
      expect(result.content.sections.some((s) => s.kind === 'abstract')).toBe(
        true,
      );
      expect(result.content.sections.some((s) => s.kind === 'paragraph')).toBe(
        true,
      );
    });

    it('maps h2 to heading2 and h3 to heading3', async () => {
      mockHtml(`
        <h1>Title</h1>
        <h2>Section Two</h2>
        <h3>Sub Section Three</h3>
        <p>Body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      expect(result.content.sections.some((s) => s.kind === 'heading2')).toBe(
        true,
      );
      expect(result.content.sections.some((s) => s.kind === 'heading3')).toBe(
        true,
      );
    });

    it('deduplicates consecutive identical paragraphs', async () => {
      mockHtml(`
        <h1>Title</h1>
        <p>Repeated paragraph text.</p>
        <p>Repeated paragraph text.</p>
        <h2>Abstract</h2><p>Abstract.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const paras = result.content.sections.filter(
        (s) => s.kind === 'paragraph',
      );
      const matching = paras.filter(
        (s) => 'html' in s && s.html.includes('Repeated paragraph text'),
      );
      expect(matching).toHaveLength(1);
    });

    it('assigns rtl direction to Arabic body paragraphs', async () => {
      mockHtml(`
        <h1>Title</h1>
        <h2>Abstract</h2><p>Abstract.</p>
        <h2>مقدمة</h2>
        <p>النص العربي للفقرة.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const arabicPara = result.content.sections.find(
        (s) =>
          s.kind === 'paragraph' &&
          'html' in s &&
          s.html.includes('النص العربي'),
      );
      expect(arabicPara?.dir).toBe('rtl');
    });

    it('sets defaultDir to rtl when Arabic title is present', async () => {
      mockHtml(`<h1>عنوان عربي</h1><p>نص.</p>`);
      const result = await service.importFromBuffer(validZipHeader);
      expect(result.content.defaultDir).toBe('rtl');
    });

    it('sets defaultDir to ltr for English-only document', async () => {
      mockHtml(`<h1>English Title</h1><p>Body text.</p>`);
      const result = await service.importFromBuffer(validZipHeader);
      expect(result.content.defaultDir).toBe('ltr');
    });

    it('preserves inline formatting (bold, italic) in paragraphs', async () => {
      mockHtml(`
        <h1>Title</h1>
        <h2>Abstract</h2><p>Abstract.</p>
        <p>This has <strong>bold</strong> and <em>italic</em> text.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const para = result.content.sections.find(
        (s) => s.kind === 'paragraph' && 'html' in s && s.html.includes('bold'),
      );
      expect(para).toBeDefined();
      expect((para as { html: string }).html).toContain('<strong>');
      expect((para as { html: string }).html).toContain('<em>');
    });
  });

  // ─── References extraction ───────────────────────────────────────────────────

  describe('references extraction', () => {
    it('collects references after English "References" heading', async () => {
      mockHtml(`
        <h1>Title</h1><p>Body</p>
        <h2>References</h2>
        <p>Author A (2020). Paper title. Journal, 1(1): 1–10.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const refs = result.content.sections.find((s) => s.kind === 'references');
      expect(refs).toBeDefined();
      expect(refs?.items).toHaveLength(1);
    });

    it('collects references after Arabic المراجع heading', async () => {
      mockHtml(`
        <h1>Title</h1><p>Body.</p>
        <h2>المراجع</h2>
        <p>الكاتب م. البحث العلمي. 2021.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const refs = result.content.sections.find((s) => s.kind === 'references');
      expect(refs).toBeDefined();
      expect(refs?.items).toHaveLength(1);
      expect(refs?.items[0]?.lang).toBe('ar');
    });

    it('assigns lang:ar to Arabic reference entries and lang:en to English', async () => {
      mockHtml(`
        <h1>Title</h1><p>Body.</p>
        <h2>References</h2>
        <p>الباحث م. الدراسة. 2021.</p>
        <p>Smith J. Study. Journal. 2020.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const refs = result.content.sections.find((s) => s.kind === 'references');
      expect(refs?.items.find((i) => i.lang === 'ar')).toBeDefined();
      expect(refs?.items.find((i) => i.lang === 'en')).toBeDefined();
    });

    it('skips table caption lines inside the references section', async () => {
      mockHtml(`
        <h1>Title</h1><p>Body.</p>
        <h2>References</h2>
        <p>Author A (2020). Paper.</p>
        <p>Table 1: Results summary</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const refs = result.content.sections.find((s) => s.kind === 'references');
      expect(refs?.items).toHaveLength(1);
      expect(refs?.items[0]?.html ?? '').toContain('Author A');
    });

    it('does not add a references section when no refs section found', async () => {
      mockHtml(`<h1>Title</h1><p>Body paragraph only.</p>`);
      const result = await service.importFromBuffer(validZipHeader);
      expect(result.content.sections.some((s) => s.kind === 'references')).toBe(
        false,
      );
    });
  });

  // ─── Tables ──────────────────────────────────────────────────────────────────

  describe('table import', () => {
    it('imports a simple HTML table as a table section', async () => {
      mockHtml(`
        <h1>Title</h1><p>Body.</p>
        <table>
          <tr><th>Header A</th><th>Header B</th></tr>
          <tr><td>Value 1</td><td>Value 2</td></tr>
        </table>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const table = result.content.sections.find(
        (s): s is TableSection => s.kind === 'table',
      );
      expect(table).toBeDefined();
      expect(table?.rows).toHaveLength(2);
    });

    it('captures first paragraph after a table as the table notes field', async () => {
      mockHtml(`
        <h1>Title</h1>
        <table>
          <tr><td>A</td><td>B</td></tr>
        </table>
        <p>حيث إن: هذه ملاحظة الجدول.</p>
        <p>Normal paragraph continuing the body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const table = result.content.sections.find(
        (s): s is TableSection => s.kind === 'table',
      );
      expect(table?.notes).toContain('حيث إن');
    });

    it('second paragraph after table is pushed as a body paragraph (not note)', async () => {
      // After the first short paragraph sets the table note, lastTableIdx resets to -1.
      // The second paragraph is no longer candidate for table notes and becomes body content.
      mockHtml(`
        <h1>Title</h1>
        <table><tr><td>Cell</td></tr></table>
        <p>حيث إن: table note text.</p>
        <p>This is regular body content after the note.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const table = result.content.sections.find(
        (s): s is TableSection => s.kind === 'table',
      );
      expect(table?.notes).toContain('حيث إن');
      // Second paragraph becomes a body paragraph, not notes
      expect(
        result.content.sections.some(
          (s) =>
            s.kind === 'paragraph' &&
            'html' in s &&
            s.html.includes('regular body content'),
        ),
      ).toBe(true);
    });

    it('imports table with thead/tbody structure', async () => {
      mockHtml(`
        <h1>Title</h1>
        <table>
          <thead><tr><th>Col A</th><th>Col B</th></tr></thead>
          <tbody><tr><td>1</td><td>2</td></tr></tbody>
        </table>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const table = result.content.sections.find(
        (s): s is TableSection => s.kind === 'table',
      );
      expect(table?.rows).toHaveLength(2);
    });
  });

  // ─── Back matter sections (Acknowledgments, Funding, etc.) ──────────────────

  describe('back matter sections', () => {
    it('imports acknowledgments content after Acknowledgements heading', async () => {
      mockHtml(`
        <h1>Title</h1><p>Body.</p>
        <h2>Acknowledgements</h2>
        <p>The authors thank Damascus University for support.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      expect(
        result.content.sections.some((s) => s.kind === 'acknowledgments'),
      ).toBe(true);
    });

    it('imports funding statement after Funding heading', async () => {
      mockHtml(`
        <h1>Title</h1><p>Body.</p>
        <h2>Funding Statement</h2>
        <p>This work was supported by grant #123.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      expect(result.content.sections.some((s) => s.kind === 'funding')).toBe(
        true,
      );
    });

    it('imports conflict of interest section', async () => {
      mockHtml(`
        <h1>Title</h1><p>Body.</p>
        <h2>Conflict of Interest</h2>
        <p>The authors declare no conflict of interest.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      expect(
        result.content.sections.some((s) => s.kind === 'conflictOfInterest'),
      ).toBe(true);
    });

    it('adds BACK_MATTER_UNCERTAIN when back matter heading is last node (no content)', async () => {
      mockHtml(`<h1>Title</h1><p>Body.</p><h2>Funding</h2>`);
      const result = await service.importFromBuffer(validZipHeader);
      expect(result.warningCodes).toContain(
        CONSTRUCTOR_IMPORT_BACK_MATTER_UNCERTAIN,
      );
    });

    it('does not add BACK_MATTER_UNCERTAIN when back matter has content', async () => {
      mockHtml(`
        <h1>Title</h1><p>Body.</p>
        <h2>Funding</h2>
        <p>Funded by Damascus University.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      expect(result.warningCodes).not.toContain(
        CONSTRUCTOR_IMPORT_BACK_MATTER_UNCERTAIN,
      );
    });
  });

  // ─── Warning codes ───────────────────────────────────────────────────────────

  describe('warning codes', () => {
    it('adds MAMMOTH_NOTES when Word reports non-suppressed warnings', async () => {
      mockHtml(`<h1>Title</h1><p>Body paragraph.</p>`, [
        warn('Unexpected style: CustomBody'),
      ]);
      const result = await service.importFromBuffer(validZipHeader);
      expect(result.warningCodes).toContain(CONSTRUCTOR_IMPORT_MAMMOTH_NOTES);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('does NOT add MAMMOTH_NOTES for suppressed table/caption warnings', async () => {
      mockHtml(`<h1>Title</h1><p>Body.</p>`, [
        warn('An unrecognised element was ignored: w:tblPrEx'),
        warn(
          "Unrecognised paragraph style: 'Table Caption' (Style ID: TableCaption)",
        ),
      ]);
      const result = await service.importFromBuffer(validZipHeader);
      expect(result.warningCodes).not.toContain(
        CONSTRUCTOR_IMPORT_MAMMOTH_NOTES,
      );
      expect(result.warnings).toHaveLength(0);
    });

    it('adds EQUATION_LOST when mammoth warns about Office Math/OMML', async () => {
      mockHtml(`<h1>Title</h1><p>Body with equation.</p>`, [
        warn('Could not convert equation (omml) at position 5'),
      ]);
      const result = await service.importFromBuffer(validZipHeader);
      expect(result.warningCodes).toContain(CONSTRUCTOR_IMPORT_EQUATION_LOST);
    });

    it('deduplicates identical mammoth warnings', async () => {
      mockHtml(`<h1>Title</h1><p>Body.</p>`, [
        warn('Unexpected style: CustomBody'),
        warn('Unexpected style: CustomBody'),
        warn('Unexpected style: CustomBody'),
      ]);
      const result = await service.importFromBuffer(validZipHeader);
      expect(
        result.warnings.filter((w) => w === 'Unexpected style: CustomBody'),
      ).toHaveLength(1);
    });

    it('does not emit any warning codes for a clean document', async () => {
      mockHtml(`<h1>Clean Title</h1><p>Clean body paragraph.</p>`);
      const result = await service.importFromBuffer(validZipHeader);
      expect(result.warningCodes).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  // ─── Backward keyword search (assignKeywordsBackward) ────────────────────────

  describe('keywords backward search', () => {
    it('assigns keywords to abstract even when body paragraphs follow it', async () => {
      mockHtml(`
        <h1>Title</h1>
        <h2>Abstract</h2>
        <p>First paragraph of the abstract.</p>
        <p>Second paragraph that is body, not abstract.</p>
        <p>Keywords: alpha, beta, gamma, delta, epsilon</p>
        <h2>Introduction</h2>
        <p>Body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const abs = result.content.sections.find(
        (s): s is AbstractSection => s.kind === 'abstract',
      );
      expect(abs?.keywords).toContain('alpha');
      expect(abs?.keywords).toContain('epsilon');
    });

    it('assigns keywords from an h2 heading tag', async () => {
      mockHtml(`
        <h1>Title</h1>
        <h2>Abstract</h2>
        <p>Abstract text.</p>
        <h2>Keywords: neural, network, deep, learning, inference</h2>
        <h2>Introduction</h2>
        <p>Body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const abs = result.content.sections.find(
        (s): s is AbstractSection => s.kind === 'abstract',
      );
      expect(abs?.keywords).toContain('neural');
      expect(abs?.keywords).toContain('inference');
    });
  });

  // ─── Engineering-format headings (h4 / h5 / h6) ───────────────────────────────

  describe('engineering-format headings', () => {
    it('detects Arabic abstract from an h6 heading (two-column engineering layout)', async () => {
      mockHtml(`
        <h1>عنوان المقالة الهندسية</h1>
        <h6>الملخص</h6>
        <p>محتوى الملخص العربي الطويل.</p>
        <h2>مقدمة</h2>
        <p>فقرة.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const abs = result.content.sections.find(
        (s): s is AbstractSection => s.kind === 'abstract' && s.lang === 'ar',
      );
      expect(abs?.text).toContain('الملخص العربي');
    });

    it('maps h4 and h5 sub-headings to heading2 (survive sanitization)', async () => {
      mockHtml(`
        <h1>Title</h1>
        <h2>Abstract</h2>
        <p>Abstract text.</p>
        <h2>Introduction</h2>
        <p>Body.</p>
        <h4>Background</h4>
        <p>More body.</p>
        <h5>Related Work</h5>
        <p>Even more body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      expect(
        result.content.sections.some(
          (s) =>
            s.kind === 'heading2' && 'text' in s && s.text === 'Background',
        ),
      ).toBe(true);
      expect(
        result.content.sections.some(
          (s) =>
            s.kind === 'heading2' && 'text' in s && s.text === 'Related Work',
        ),
      ).toBe(true);
    });
  });

  // ─── Author detection improvements ───────────────────────────────────────────

  describe('author detection improvements', () => {
    it('detects plain (non-bold) author line with superscript numbers in author zone', async () => {
      mockHtml(`
        <h1>Article Title</h1>
        <p>Ahmad Al-Hassan<sup>1</sup>, Rania Mahmoud<sup>2</sup></p>
        <h2>Abstract</h2>
        <p>Abstract text.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const authors = result.content.sections.find(
        (s): s is AuthorsSection => s.kind === 'authors',
      );
      expect(authors?.authors).toHaveLength(2);
      expect(authors?.authors[0]?.fullName).toContain('Ahmad');
      expect(authors?.authors[1]?.fullName).toContain('Rania');
    });

    it('does not parse affiliation lines that start with superscript as author names', async () => {
      mockHtml(`
        <h1>Article Title</h1>
        <p>Ahmad Al-Hassan<sup>1</sup></p>
        <p><sup>1</sup>Faculty of Engineering, Damascus University</p>
        <h2>Abstract</h2>
        <p>Abstract text.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const authors = result.content.sections.find(
        (s): s is AuthorsSection => s.kind === 'authors',
      );
      expect(authors?.authors).toHaveLength(1);
      expect(authors?.authors[0]?.fullName).toContain('Ahmad');
      expect(authors?.authors.some((a) => a.fullName.includes('Faculty'))).toBe(
        false,
      );
    });
  });

  // ─── Language-aware title detection (isAllBoldParagraph) ─────────────────────

  describe('language-aware title detection in bold paragraphs', () => {
    it('treats Arabic bold section heading as heading2 after AR title is already set', async () => {
      mockHtml(`
        <p><strong>عنوان المقالة العربية الرئيسية</strong></p>
        <p><strong>المقدمة</strong></p>
        <h2>Abstract</h2>
        <p>Abstract text.</p>
        <h2>Introduction</h2>
        <p>Body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const titles = result.content.sections.filter((s) => s.kind === 'title');
      expect(titles).toHaveLength(1);
      expect(titles[0].lang).toBe('ar');
      expect(
        result.content.sections.some(
          (s) => s.kind === 'heading2' && 'text' in s && s.text === 'المقدمة',
        ),
      ).toBe(true);
    });
  });

  // ─── h1 title gate (fix: AND + sections.length guard) ─────────────────────────

  describe('h1 title gate', () => {
    it('h1 appearing after body content becomes heading1, not a second title', async () => {
      mockHtml(`
        <h1>Main Article Title Here</h1>
        <p>Some introductory body text.</p>
        <h1>Introduction</h1>
        <p>Body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const titles = result.content.sections.filter((s) => s.kind === 'title');
      expect(titles).toHaveLength(1);
      expect(titles[0].lang).toBe('en');
      expect(
        result.content.sections.some(
          (s) =>
            s.kind === 'heading1' && 'text' in s && s.text === 'Introduction',
        ),
      ).toBe(true);
    });
  });

  // ─── Heading superscript cleanup (getTextWithoutSup) ──────────────────────────

  describe('heading superscript cleanup', () => {
    it('strips footnote superscript from bold paragraph heading outside author zone', async () => {
      mockHtml(`
        <h1>Title</h1>
        <h2>Abstract</h2>
        <p>Abstract text.</p>
        <h2>Introduction</h2>
        <p>First body paragraph.</p>
        <p><strong>Phase 2 Results<sup>3</sup></strong></p>
        <p>Results body.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      expect(
        result.content.sections.some(
          (s) =>
            s.kind === 'heading2' &&
            'text' in s &&
            s.text === 'Phase 2 Results',
        ),
      ).toBe(true);
      expect(
        result.content.sections.some(
          (s) =>
            s.kind === 'heading2' &&
            'text' in s &&
            (s as { text: string }).text.includes('Results3'),
        ),
      ).toBe(false);
    });
  });

  // ─── Full Damascus University document simulation ─────────────────────────────

  describe('full Damascus University document simulation', () => {
    it('correctly imports a well-structured Damascus template', async () => {
      mockHtml(`
        <h1>Effect of Temperature on Enzyme Activity in Model Systems</h1>
        <h1>تأثير درجة الحرارة على نشاط الإنزيم في النماذج الاختبارية</h1>
        <p><strong>Ahmed Al-Hassan* — Dr.</strong></p>
        <p>Faculty of Science, Damascus University — ahmed@damascus.edu.sy</p>
        <p>Rania Mahmoud — Prof.</p>
        <p>Faculty of Medicine, Damascus University — rania@damascus.edu.sy</p>
        <h2>Abstract</h2>
        <p>This study examines the thermal stability and catalytic efficiency of enzyme complexes under varying conditions.</p>
        <p>Keywords: Enzyme, Thermal, Stability, Catalytic, Efficiency</p>
        <h2>الملخص</h2>
        <p>تبحث هذه الدراسة في الاستقرارية الحرارية والكفاءة التحفيزية لمركبات الإنزيم.</p>
        <p>الكلمات المفتاحية: إنزيم، حراري، استقرارية، تحفيزي، كفاءة</p>
        <h2>Introduction</h2>
        <p>Enzymes play a critical role in biological processes.</p>
        <h2>Literature Review</h2>
        <p>Prior studies have examined thermal effects (Smith, 2020).</p>
        <h2>Materials and Methods</h2>
        <p>Enzyme samples were prepared using standard protocols.</p>
        <h2>Results and Discussion</h2>
        <p>Temperature increase led to significant activity changes.</p>
        <h2>Conclusions</h2>
        <ol><li>Enzyme activity peaks at 37°C.</li><li>Stability decreases above 50°C.</li></ol>
        <h2>References</h2>
        <p>الباحث م. (2021). دراسة في الإنزيمات. مجلة دمشق، 5(2): 10–20.</p>
        <p>Smith J. (2020). Thermal effects on enzymes. Biochemistry, 10: 1–15.</p>
      `);
      const result = await service.importFromBuffer(validZipHeader);
      const { sections } = result.content;

      // Bilingual titles
      expect(sections.filter((s) => s.kind === 'title')).toHaveLength(2);

      // Authors — two parsed, one is corresponding, the corresponding one has email
      const authSection = sections.find(
        (s): s is AuthorsSection => s.kind === 'authors',
      );
      expect(authSection?.authors).toHaveLength(2);
      expect(authSection?.authors.some((a) => a.isCorresponding)).toBe(true);
      expect(
        authSection?.authors.some((a) => a.email.includes('ahmed@damascus')),
      ).toBe(true);

      // Bilingual abstracts
      const enAbs = sections.find(
        (s): s is AbstractSection => s.kind === 'abstract' && s.lang === 'en',
      );
      const arAbs = sections.find(
        (s): s is AbstractSection => s.kind === 'abstract' && s.lang === 'ar',
      );
      expect(enAbs?.text).toBeTruthy();
      expect(arAbs?.text).toBeTruthy();
      expect(enAbs?.keywords).toContain('Enzyme');
      expect(arAbs?.keywords).toContain('إنزيم');

      // IMRaD headings present
      expect(
        sections.some(
          (s) =>
            s.kind === 'heading2' && 'text' in s && s.text === 'Introduction',
        ),
      ).toBe(true);
      expect(
        sections.some(
          (s) =>
            s.kind === 'heading2' && 'text' in s && /literature/i.test(s.text),
        ),
      ).toBe(true);
      expect(
        sections.some(
          (s) =>
            s.kind === 'heading2' && 'text' in s && /materials/i.test(s.text),
        ),
      ).toBe(true);
      expect(
        sections.some(
          (s) =>
            s.kind === 'heading2' && 'text' in s && /results/i.test(s.text),
        ),
      ).toBe(true);
      expect(
        sections.some(
          (s) =>
            s.kind === 'heading2' && 'text' in s && /conclusions/i.test(s.text),
        ),
      ).toBe(true);

      // References with language tags
      const refs = sections.find((s) => s.kind === 'references');
      expect(refs?.items).toHaveLength(2);
      expect(refs?.items.some((i) => i.lang === 'ar')).toBe(true);
      expect(refs?.items.some((i) => i.lang === 'en')).toBe(true);

      // No import warnings
      expect(result.warningCodes).toHaveLength(0);
    });
  });
});
