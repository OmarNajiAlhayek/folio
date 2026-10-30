import { randomUUID } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { extname, join } from 'path';
import { DataSource } from 'typeorm';
import { resolveUploadRoot } from '../common/upload-root';
import type { RequestUser } from '../common/types/request-user';
import { SubmissionFile } from '../entities/submission-file.entity';
import { SubmissionFileStage } from '../entities/submission-file-stage.enum';
import type { SubmissionsService } from '../submissions/submissions.service';

export function uploadRoot(): string {
  return resolveUploadRoot();
}

/** Same `_tmp` layout as submission-file-multer diskStorage. */
function uploadTmpDir(): string {
  const tmp = join(uploadRoot(), '_tmp');
  if (!existsSync(tmp)) {
    mkdirSync(tmp, { recursive: true });
  }
  return tmp;
}

/** Writes a real temp file so SubmissionsService.addFile can rename it. */
export function sampleMulterFile(
  originalname: string,
  buffer: Buffer,
): Express.Multer.File {
  const ext = extname(originalname).toLowerCase() || '.pdf';
  const filename = `${randomUUID()}${ext}`;
  const destination = uploadTmpDir();
  const path = join(destination, filename);
  writeFileSync(path, buffer);
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: buffer.length,
    destination,
    filename,
    path,
  } as Express.Multer.File;
}

export async function promoteManuscriptsToReviewPackage(
  dataSource: DataSource,
  submissionId: string,
): Promise<void> {
  await dataSource
    .getRepository(SubmissionFile)
    .update(
      { submissionId, kind: 'manuscript' },
      { fileStage: SubmissionFileStage.REVIEW },
    );
}

export async function attachStandardFilePackage(
  submissionsService: SubmissionsService,
  slug: string,
  authorReq: RequestUser,
  pdfBytes: Buffer,
  manuscriptFilename: string,
) {
  await submissionsService.addFile(
    slug,
    authorReq,
    sampleMulterFile('cover-letter.pdf', pdfBytes),
    'cover_letter',
  );
  await submissionsService.addFile(
    slug,
    authorReq,
    sampleMulterFile('title-page.pdf', pdfBytes),
    'title_page',
  );
  await submissionsService.addFile(
    slug,
    authorReq,
    sampleMulterFile(manuscriptFilename, pdfBytes),
    'manuscript',
  );
}

export function clearUploadFiles(): void {
  const root = uploadRoot();
  if (!existsSync(root)) {
    return;
  }
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (name === '_tmp') {
      for (const tmpName of readdirSync(full)) {
        try {
          unlinkSync(join(full, tmpName));
        } catch {
          /* ignore */
        }
      }
      continue;
    }
    try {
      if (statSync(full).isDirectory()) {
        rmSync(full, { recursive: true, force: true });
      } else {
        unlinkSync(full);
      }
    } catch {
      /* ignore */
    }
  }
}
