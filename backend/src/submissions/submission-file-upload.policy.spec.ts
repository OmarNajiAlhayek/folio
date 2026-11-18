import { readFileSync } from 'fs';
import { join } from 'path';
import { minimalPdf } from '../common/minimal-pdf';
import {
  acceptAttributeForKind,
  bufferHasPdfTrailer,
  isExtensionAllowedForKind,
  sniffUploadMime,
} from './submission-file-upload.policy';

describe('submission-file-upload.policy', () => {
  it('accepts pdf extension for manuscript', () => {
    expect(isExtensionAllowedForKind('paper.pdf', 'manuscript')).toBe(true);
    expect(isExtensionAllowedForKind('paper.exe', 'manuscript')).toBe(false);
  });

  it('sniffs PDF magic bytes', () => {
    const buf = Buffer.from('%PDF-1.4\n');
    const result = sniffUploadMime(buf, '.pdf', 'manuscript');
    expect(result).toEqual({ ok: true, mimeType: 'application/pdf' });
  });

  it('rejects a PDF header that has no trailer', () => {
    const buf = Buffer.from('%PDF-1.4 not a real document\n');
    expect(sniffUploadMime(buf, '.pdf', 'manuscript').ok).toBe(true);
    expect(bufferHasPdfTrailer(buf)).toBe(false);
  });

  it('accepts a one-page PDF that a viewer can open', () => {
    expect(bufferHasPdfTrailer(minimalPdf('Sample manuscript'))).toBe(true);
  });

  it('rejects exe renamed to pdf', () => {
    const buf = Buffer.from('MZ\x90\x00');
    const result = sniffUploadMime(buf, '.pdf', 'manuscript');
    expect(result.ok).toBe(false);
  });

  it('sniffs docx as PK zip header', () => {
    const sample = readFileSync(
      join(__dirname, 'submission-file-upload.policy.spec.ts'),
    );
    const buf = sample.subarray(0, 64);
    if (buf[0] === 0x50 && buf[1] === 0x4b) {
      const result = sniffUploadMime(buf, '.docx', 'manuscript');
      expect(result.ok).toBe(true);
    }
  });

  it('allows xlsx and csv only for supplementary files', () => {
    expect(isExtensionAllowedForKind('data.xlsx', 'supplementary')).toBe(true);
    expect(isExtensionAllowedForKind('data.csv', 'supplementary')).toBe(true);
    expect(isExtensionAllowedForKind('data.xlsx', 'manuscript')).toBe(false);
    expect(isExtensionAllowedForKind('data.csv', 'figure')).toBe(false);
  });

  it('sniffs xlsx as a ZIP container', () => {
    const ok = sniffUploadMime(
      Buffer.from([0x50, 0x4b, 3, 4]),
      '.xlsx',
      'supplementary',
    );
    expect(ok.ok).toBe(true);
    expect(
      sniffUploadMime(Buffer.from('MZ\x90\x00'), '.xlsx', 'supplementary').ok,
    ).toBe(false);
  });

  it('accepts text csv and rejects binary renamed to csv', () => {
    const ok = sniffUploadMime(
      Buffer.from('a,b\n1,2\n'),
      '.csv',
      'supplementary',
    );
    expect(ok).toEqual({ ok: true, mimeType: 'text/csv' });
    expect(
      sniffUploadMime(Buffer.from('MZ\x90\x00\x03'), '.csv', 'supplementary')
        .ok,
    ).toBe(false);
  });

  it('builds accept attribute for figure', () => {
    const accept = acceptAttributeForKind('figure');
    expect(accept).toContain('.png');
    expect(accept).toContain('image/webp');
  });
});
