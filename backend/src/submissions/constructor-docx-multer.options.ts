import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';
import { memoryStorage } from 'multer';
import { SUBMISSION_UPLOAD_MAX_BYTES } from './submission-file-multer.options';

export const constructorDocxMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: SUBMISSION_UPLOAD_MAX_BYTES },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (extname(file.originalname).toLowerCase() !== '.docx') {
      cb(
        new BadRequestException({
          message: 'Only .docx Word files can be imported',
          code: 'VALIDATION_ERROR',
        }) as unknown as Error,
        false,
      );
      return;
    }
    cb(null, true);
  },
};
