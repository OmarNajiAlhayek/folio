import { minimalPdf } from './minimal-pdf';

describe('minimalPdf', () => {
  const pdf = minimalPdf('Sample manuscript (demo)');

  it('is a one-page PDF a viewer can open', () => {
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text).toContain('/Type /Page');
    expect(text).toContain('/Type /Font');
    expect(text).toContain('%%EOF');

    const startxref = text.match(/startxref\n(\d+)\n%%EOF/);
    expect(startxref).not.toBeNull();
    const xrefAt = Number(startxref![1]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref');
    expect(text).toContain('1 0 obj');
    expect(text.indexOf('1 0 obj')).toBeGreaterThan(8);
  });

  it('draws the title and escapes PDF string delimiters', () => {
    const text = pdf.toString('latin1');
    expect(text).toContain('Sample manuscript \\(demo\\)');
    expect(text).not.toContain('(Sample manuscript (demo))');
  });

  it('replaces characters Helvetica cannot draw', () => {
    const text = minimalPdf('عنوان').toString('latin1');
    expect(text).toContain('(?????)');
  });
});
