import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import mammoth from 'mammoth';
import { DocxImportService } from './docx-import.service';

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
});
