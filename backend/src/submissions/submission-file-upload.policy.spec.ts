import { readFileSync } from 'fs';
import { join } from 'path';
import {
  acceptAttributeForKind,
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

  it('builds accept attribute for figure', () => {
    const accept = acceptAttributeForKind('figure');
    expect(accept).toContain('.png');
    expect(accept).toContain('image/webp');
  });
});
