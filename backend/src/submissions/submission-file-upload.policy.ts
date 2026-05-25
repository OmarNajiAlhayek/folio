import { extname } from 'path';
import { SubmissionFileKind } from './submission-file-kinds';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const POLICY: Record<
  SubmissionFileKind,
  { extensions: readonly string[]; mimeTypes: readonly string[] }
> = {
  manuscript: {
    extensions: ['.pdf', '.docx'],
    mimeTypes: ['application/pdf', DOCX_MIME],
  },
  manuscript_constructor: {
    extensions: ['.docx'],
    mimeTypes: [DOCX_MIME],
  },
  cover_letter: {
    extensions: ['.pdf', '.docx'],
    mimeTypes: ['application/pdf', DOCX_MIME],
  },
  title_page: {
    extensions: ['.pdf', '.docx'],
    mimeTypes: ['application/pdf', DOCX_MIME],
  },
  figure: {
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    mimeTypes: [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
    ],
  },
  table: {
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    mimeTypes: [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
    ],
  },
  supplementary: {
    extensions: ['.pdf', '.docx', '.zip'],
    mimeTypes: ['application/pdf', DOCX_MIME, 'application/zip'],
  },
};

/** Union of every allowed extension (for Multer fileFilter when kind is unknown). */
export const ALL_ALLOWED_UPLOAD_EXTENSIONS = [
  ...new Set(
    Object.values(POLICY).flatMap((p) => p.extensions),
  ),
] as readonly string[];

export function allowedExtensionsForKind(
  kind: SubmissionFileKind,
): readonly string[] {
  return POLICY[kind].extensions;
}

export function isExtensionAllowedForKind(
  originalName: string,
  kind: SubmissionFileKind,
): boolean {
  const ext = extname(originalName).toLowerCase();
  return POLICY[kind].extensions.includes(ext);
}

export function isExtensionAllowedForUpload(originalName: string): boolean {
  const ext = extname(originalName).toLowerCase();
  return ALL_ALLOWED_UPLOAD_EXTENSIONS.includes(ext);
}

export type MagicSniffResult =
  | { ok: true; mimeType: string }
  | { ok: false; reason: string };

function readAscii(buf: Buffer, len: number): string {
  return buf.subarray(0, Math.min(len, buf.length)).toString('ascii');
}

/**
 * Lightweight magic-byte sniff (first ~4KB). Extension must already match policy.
 */
export function sniffUploadMime(
  buf: Buffer,
  ext: string,
  kind: SubmissionFileKind,
): MagicSniffResult {
  const allowedMimes = POLICY[kind].mimeTypes;
  const normalizedExt = ext.toLowerCase();

  if (normalizedExt === '.pdf') {
    if (!readAscii(buf, 5).startsWith('%PDF-')) {
      return { ok: false, reason: 'File content does not match PDF' };
    }
    return { ok: true, mimeType: 'application/pdf' };
  }

  if (normalizedExt === '.docx' || normalizedExt === '.zip') {
    if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      return {
        ok: false,
        reason: 'File content does not match ZIP/DOCX archive',
      };
    }
    if (normalizedExt === '.docx') {
      return { ok: true, mimeType: DOCX_MIME };
    }
    return { ok: true, mimeType: 'application/zip' };
  }

  if (normalizedExt === '.png') {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!sig.every((b, i) => buf[i] === b)) {
      return { ok: false, reason: 'File content does not match PNG' };
    }
    return { ok: true, mimeType: 'image/png' };
  }

  if (normalizedExt === '.jpg' || normalizedExt === '.jpeg') {
    if (buf[0] !== 0xff || buf[1] !== 0xd8) {
      return { ok: false, reason: 'File content does not match JPEG' };
    }
    return { ok: true, mimeType: 'image/jpeg' };
  }

  if (normalizedExt === '.gif') {
    const head = readAscii(buf, 6);
    if (head !== 'GIF87a' && head !== 'GIF89a') {
      return { ok: false, reason: 'File content does not match GIF' };
    }
    return { ok: true, mimeType: 'image/gif' };
  }

  if (normalizedExt === '.webp') {
    if (readAscii(buf, 4) !== 'RIFF' || readAscii(buf.subarray(8), 4) !== 'WEBP') {
      return { ok: false, reason: 'File content does not match WebP' };
    }
    return { ok: true, mimeType: 'image/webp' };
  }

  return {
    ok: false,
    reason: `Unsupported extension ${normalizedExt}`,
  };
}

export function canonicalMimeForSniff(
  result: MagicSniffResult,
  kind: SubmissionFileKind,
): string {
  if (!result.ok) {
    throw new Error('canonicalMimeForSniff called on failed sniff');
  }
  if (allowedMimesIncludes(kind, result.mimeType)) {
    return result.mimeType;
  }
  return POLICY[kind].mimeTypes[0]!;
}

function allowedMimesIncludes(
  kind: SubmissionFileKind,
  mime: string,
): boolean {
  return POLICY[kind].mimeTypes.includes(mime);
}

/** HTML `accept` attribute value for a submission file kind. */
export function acceptAttributeForKind(kind: SubmissionFileKind): string {
  const exts = POLICY[kind].extensions;
  const mimes = POLICY[kind].mimeTypes;
  return [...mimes, ...exts].join(',');
}
