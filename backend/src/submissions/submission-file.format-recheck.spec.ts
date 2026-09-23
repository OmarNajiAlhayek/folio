import { copyFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { SubmissionFileService } from './submission-file.service';
import type { Submission } from '../entities/submission.entity';
import { damascusUniversityJournalV1 } from '../manuscript-styles/profiles/damascus-university-journal-v1.profile';

describe('SubmissionFileService.refreshManuscriptFormatViolations', () => {
  let uploadDir: string;
  let previousUploadDir: string | undefined;
  let filesRepo: { findOne: jest.Mock };
  let submissionsRepo: { update: jest.Mock; save: jest.Mock };
  let service: SubmissionFileService;

  const stale = [
    {
      code: 'FONT_LATIN',
      message: 'stale',
      messageAr: 'stale',
      expected: 'Times New Roman',
      found: 'Calibri',
    },
  ];
  const submission = () =>
    ({
      id: 'sub-1',
      disciplines: [],
      constructorContent: null,
      docxManuscriptViolations: stale,
    }) as unknown as Submission;

  beforeEach(() => {
    uploadDir = mkdtempSync(join(tmpdir(), 'folio-recheck-'));
    previousUploadDir = process.env.UPLOAD_DIR;
    // uploadRoot() resolves UPLOAD_DIR against the working directory.
    process.env.UPLOAD_DIR = relative(process.cwd(), uploadDir);
    filesRepo = { findOne: jest.fn() };
    submissionsRepo = { update: jest.fn(), save: jest.fn() };
    service = new SubmissionFileService(
      submissionsRepo as never,
      filesRepo as never,
      {} as never,
      {} as never,
      {
        resolveEffectiveStyleId: () => damascusUniversityJournalV1.id,
        getProfile: () => damascusUniversityJournalV1,
      } as never,
      {} as never,
      { findJournal: jest.fn().mockResolvedValue(null) } as never,
    );
  });

  afterEach(() => {
    process.env.UPLOAD_DIR = previousUploadDir;
    rmSync(uploadDir, { recursive: true, force: true });
  });

  it('re-checks the attached Word file with the current rules', async () => {
    copyFileSync(
      join(__dirname, '__fixtures__', 'damascus-author-template.docx'),
      join(uploadDir, 'm.docx'),
    );
    filesRepo.findOne.mockResolvedValue({
      originalName: 'paper.docx',
      storageKey: 'm.docx',
    });
    const s = submission();

    await service.refreshManuscriptFormatViolations(s);

    expect(s.docxManuscriptViolations).not.toEqual(stale);
    expect(
      s.docxManuscriptViolations?.every((v) => v.severity !== undefined),
    ).toBe(true);
    expect(submissionsRepo.update).toHaveBeenCalledWith('sub-1', {
      docxManuscriptViolations: s.docxManuscriptViolations,
    });
  });

  it('clears the result when the manuscript is no longer a Word file', async () => {
    filesRepo.findOne.mockResolvedValue({
      originalName: 'paper.pdf',
      storageKey: 'm.pdf',
    });
    const s = submission();

    await service.refreshManuscriptFormatViolations(s);

    expect(s.docxManuscriptViolations).toBeNull();
    expect(submissionsRepo.update).toHaveBeenCalledWith('sub-1', {
      docxManuscriptViolations: null,
    });
  });

  it('keeps the upload-time result when the file is missing on disk', async () => {
    filesRepo.findOne.mockResolvedValue({
      originalName: 'paper.docx',
      storageKey: 'gone.docx',
    });
    const s = submission();

    await service.refreshManuscriptFormatViolations(s);

    expect(s.docxManuscriptViolations).toBe(stale);
    expect(submissionsRepo.update).not.toHaveBeenCalled();
  });
});
