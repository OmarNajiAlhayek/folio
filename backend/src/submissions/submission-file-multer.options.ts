import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { diskStorage } from 'multer';
import { isExtensionAllowedForUpload } from './submission-file-upload.policy';

export const SUBMISSION_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

function uploadTmpDir(): string {
  const rel = process.env.UPLOAD_DIR ?? join('..', 'uploads');
  const root = join(process.cwd(), rel);
  const tmp = join(root, '_tmp');
  if (!existsSync(tmp)) {
    mkdirSync(tmp, { recursive: true });
  }
  return tmp;
}

export const submissionFileMulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadTmpDir());
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: SUBMISSION_UPLOAD_MAX_BYTES },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!isExtensionAllowedForUpload(file.originalname)) {
      cb(
        new BadRequestException({
          message: 'File type not allowed',
          code: 'VALIDATION_ERROR',
        }) as unknown as Error,
        false,
      );
      return;
    }
    cb(null, true);
  },
};
