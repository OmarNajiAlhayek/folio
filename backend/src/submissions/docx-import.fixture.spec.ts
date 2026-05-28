import { readFileSync } from 'fs';
import { join } from 'path';
import { Test } from '@nestjs/testing';
import { DocxImportService } from './docx-import.service';

/**
 * Real Mammoth parse of the Playwright fixture (not mocked).
 */
describe('DocxImportService (minimal-import fixture)', () => {
  let service: DocxImportService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [DocxImportService],
    }).compile();
    service = module.get(DocxImportService);
  });

  it('imports authors, bilingual abstracts, and filters reference noise', async () => {
    const docxPath = join(
      __dirname,
      '..',
      '..',
      '..',
      'frontend',
      'e2e',
      'fixtures',
      'minimal-import.docx',
    );
    const buffer = readFileSync(docxPath);
    const result = await service.importFromBuffer(buffer);

    expect(result.content.sections.some((s) => s.kind === 'authors')).toBe(
      true,
    );
    const enAbstract = result.content.sections.find(
      (s) => s.kind === 'abstract' && s.lang === 'en',
    );
    const arAbstract = result.content.sections.find(
      (s) => s.kind === 'abstract' && s.lang === 'ar',
    );
    expect(enAbstract?.text).toMatch(/Grate Abstract/i);
    expect(arAbstract?.text).toBeTruthy();

    const refs = result.content.sections.find((s) => s.kind === 'references');
    expect(
      refs?.items.some((i) => (i.html ?? i.text ?? '').includes('ladskjf')),
    ).toBe(true);
    expect(
      refs?.items.some((i) => /^Table\s+1:/i.test(i.html ?? i.text ?? '')),
    ).toBe(false);
  });
});
