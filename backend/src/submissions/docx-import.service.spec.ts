import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mammoth from 'mammoth';
import { DocxImportService } from './docx-import.service';
import { CONSTRUCTOR_IMPORT_NO_CONTENT } from './docx-import-warning-codes';

jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    convertToHtml: jest.fn(),
  },
}));

const convertToHtml = mammoth.convertToHtml as jest.Mock;

describe('DocxImportService', () => {
  let service: DocxImportService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [DocxImportService],
    }).compile();
    service = module.get(DocxImportService);
    convertToHtml.mockReset();
  });

  const validZipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);

  it('rejects non-docx magic bytes', async () => {
    await expect(
      service.importFromBuffer(Buffer.from('%PDF-1.4')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps title, abstract, and body paragraphs', async () => {
    convertToHtml.mockResolvedValue({
      value: `<h1>Sample Article</h1>
        <h1>Abstract</h1>
        <p>This is the abstract text.</p>
        <p>Keywords: one, two, three</p>
        <h2>Introduction</h2>
        <p>First paragraph of the body.</p>`,
      messages: [],
    });

    const result = await service.importFromBuffer(validZipHeader);
    expect(result.content.sections.some((s) => s.kind === 'title')).toBe(true);
    expect(result.content.sections.some((s) => s.kind === 'abstract')).toBe(
      true,
    );
    expect(
      result.content.sections.filter((s) => s.kind === 'paragraph').length,
    ).toBeGreaterThanOrEqual(1);
    const title = result.content.sections.find((s) => s.kind === 'title');
    expect((title as { text?: string })?.text).toBe('Sample Article');
  });

  it('collects references after a References heading', async () => {
    convertToHtml.mockResolvedValue({
      value: `<h1>Title</h1><p>Body</p><h2>References</h2><p>Author A (2020). Paper.</p>`,
      messages: [],
    });
    const result = await service.importFromBuffer(validZipHeader);
    const refs = result.content.sections.find((s) => s.kind === 'references');
    expect(refs).toBeDefined();
    expect((refs as { items: unknown[] }).items.length).toBe(1);
  });

  it('maps author lines between title and abstract into authors section', async () => {
    convertToHtml.mockResolvedValue({
      value: `<h1>Sample Article</h1>
        <p><strong>Ada Lovelace* — Dr.</strong></p>
        <p>Analytical Engine University — ada@test.dev</p>
        <h2>Abstract</h2>
        <p>English abstract body.</p>`,
      messages: [],
    });
    const result = await service.importFromBuffer(validZipHeader);
    const authors = result.content.sections.find((s) => s.kind === 'authors');
    expect(authors).toBeDefined();
    expect((authors as { authors: { fullName: string; email: string }[] }).authors[0]
      ?.fullName).toContain('Ada');
    expect(
      (authors as { authors: { email: string }[] }).authors[0]?.email,
    ).toContain('ada@test.dev');
  });

  it('treats Arabic abstract heading as abstract slot', async () => {
    convertToHtml.mockResolvedValue({
      value: `<h1>Title</h1>
        <h2>الملخص</h2>
        <p>نص الملخص العربي.</p>`,
      messages: [],
    });
    const result = await service.importFromBuffer(validZipHeader);
    const arAbstract = result.content.sections.find(
      (s) => s.kind === 'abstract' && (s as { lang?: string }).lang === 'ar',
    );
    expect(arAbstract).toBeDefined();
    expect((arAbstract as { text: string }).text).toContain('نص الملخص');
    expect(
      result.content.sections.some(
        (s) => s.kind === 'heading2' && (s as { text: string }).text === 'الملخص',
      ),
    ).toBe(false);
  });

  it('skips table caption lines in references', async () => {
    convertToHtml.mockResolvedValue({
      value: `<h1>References</h1><p>Author A (2020). Paper.</p><p>Table 1: ddd</p>`,
      messages: [],
    });
    const result = await service.importFromBuffer(validZipHeader);
    const refs = result.content.sections.find((s) => s.kind === 'references');
    expect((refs as { items: { html: string }[] }).items).toHaveLength(1);
    expect((refs as { items: { html: string }[] }).items[0]?.html).toContain(
      'Author A',
    );
  });

  it('throws CONSTRUCTOR_IMPORT_NO_CONTENT when parse yields no sections', async () => {
    convertToHtml.mockResolvedValue({
      value: `<h2>Abstract</h2><h1>References</h1><p><img src="data:image/png;base64,abc" /></p>`,
      messages: [],
    });
    await expect(service.importFromBuffer(validZipHeader)).rejects.toMatchObject({
      response: { code: CONSTRUCTOR_IMPORT_NO_CONTENT },
    });
  });

  it('adds mammoth warning code when Word reports non-suppressed notes', async () => {
    convertToHtml.mockResolvedValue({
      value: `<h1>Title</h1><p>Body paragraph.</p>`,
      messages: [{ type: 'warning', message: 'Unexpected style: CustomBody' }],
    });
    const result = await service.importFromBuffer(validZipHeader);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warningCodes).toContain('CONSTRUCTOR_IMPORT_MAMMOTH_NOTES');
  });
});
