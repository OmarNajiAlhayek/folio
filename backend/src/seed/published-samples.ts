import { DataSource } from 'typeorm';
import { minimalPdf } from '../common/minimal-pdf';
import type { RequestUser } from '../common/types/request-user';
import {
  CopyeditAssignment,
  CopyeditAssignmentStatus,
} from '../entities/copyedit-assignment.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { Submission } from '../entities/submission.entity';
import type { User } from '../entities/user.entity';
import {
  placeSampleForPublication,
  type SeededPress,
} from '../journals/seed-journals';
import type { SeedEditorRequests } from './accounts';
import type { SeedContext } from './context';
import { syncSampleDiscipline } from './sample-discipline';
import {
  SAMPLE_DISCIPLINE_DEFAULT,
  SAMPLE_DISCIPLINE_MEDICAL,
  SAMPLE_PUB1_META,
  SAMPLE_PUB2_META,
  SAMPLE_PUB3_META,
  SAMPLE_PUBLISHED_MEDICAL_TITLE,
  SAMPLE_PUBLISHED_PEER_TITLE,
  SAMPLE_PUBLISHED_TITLE,
  samplePublicationMetadata,
  seedJournalId,
  type SampleMetaOverrides,
} from './sample-content';
import { attachStandardFilePackage, sampleMulterFile } from './sample-files';
import { findSampleSubmission } from './workflow-samples';

/** Ensure revision manuscript `created_at` is strictly after the copyedit note. */
async function sleepForRevisionTimestamp(): Promise<void> {
  await new Promise((r) => setTimeout(r, 25));
}

async function addRevisionManuscriptAfterNote(options: {
  submissionsService: SeedContext['submissionsService'];
  submissionSlug: string;
  authorReq: RequestUser;
  revisionFilename: string;
  title: string;
}): Promise<void> {
  const {
    submissionsService,
    submissionSlug,
    authorReq,
    revisionFilename,
    title,
  } = options;

  await sleepForRevisionTimestamp();
  await submissionsService.addFile(
    submissionSlug,
    authorReq,
    sampleMulterFile(revisionFilename, minimalPdf(title)),
    'manuscript',
  );
}

async function resumePublishedSampleSeed(options: {
  dataSource: DataSource;
  submissionsService: SeedContext['submissionsService'];
  author: User;
  authorReq: RequestUser;
  copyeditorReq: RequestUser;
  revisionFilename: string;
  existing: Submission;
  press: SeededPress;
  disciplineLabel: string;
  logLabel: string;
}): Promise<void> {
  const {
    dataSource,
    submissionsService,
    author,
    authorReq,
    copyeditorReq,
    revisionFilename,
    existing,
    press,
    disciplineLabel,
    logLabel,
  } = options;

  if (!existing.slug) {
    throw new Error(
      `Cannot resume published sample without slug: ${existing.title}`,
    );
  }

  if (existing.status === SubmissionStatus.PUBLISHED) {
    return;
  }

  if (existing.status !== SubmissionStatus.COPYEDITING) {
    throw new Error(
      `Cannot resume published sample "${existing.title}" from status ${existing.status}`,
    );
  }

  const assignment = await dataSource
    .getRepository(CopyeditAssignment)
    .findOne({
      where: { submissionId: existing.id },
      order: { assignedAt: 'DESC' },
    });
  if (!assignment?.slug) {
    throw new Error(`Missing copyedit assignment for "${existing.title}"`);
  }

  if (assignment.status === CopyeditAssignmentStatus.AWAITING_AUTHOR) {
    await addRevisionManuscriptAfterNote({
      submissionsService,
      submissionSlug: existing.slug,
      authorReq,
      revisionFilename,
      title: existing.title,
    });
    await submissionsService.markCopyeditAuthorReady(
      assignment.slug,
      author.id,
    );
  } else if (assignment.status !== CopyeditAssignmentStatus.READY_FOR_REVIEW) {
    throw new Error(
      `Cannot resume published sample "${existing.title}" from assignment status ${assignment.status}`,
    );
  }

  const resumeIssue = await placeSampleForPublication(
    dataSource,
    existing.id,
    disciplineLabel,
    press,
  );
  await submissionsService.publishSubmission(
    existing.slug,
    copyeditorReq,
    resumeIssue.id,
  );
  console.log(`Resumed: ${existing.title} (${logLabel})`);
}

/** Full workflow: create → submit → accept → copyedit → publish (public catalog). */
async function seedPublishedSample(options: {
  dataSource: DataSource;
  submissionsService: SeedContext['submissionsService'];
  author: User;
  authorReq: RequestUser;
  editorReq: RequestUser;
  copyeditor: User;
  copyeditorReq: RequestUser;
  title: string;
  abstract: string;
  publicationMeta: SampleMetaOverrides;
  manuscriptFilename: string;
  revisionFilename: string;
  discipline: {
    topLabel: string;
    confidence: number;
    suggestedLabels?: string[];
    disciplines?: string[];
  };
  press: SeededPress;
  logLabel: string;
}): Promise<void> {
  const {
    press,
    dataSource,
    submissionsService,
    author,
    authorReq,
    editorReq,
    copyeditor,
    copyeditorReq,
    title,
    abstract,
    publicationMeta,
    manuscriptFilename,
    revisionFilename,
    discipline,
    logLabel,
  } = options;

  const pdfBytes = minimalPdf(title);
  const existing = await findSampleSubmission(dataSource, author.id, title);
  if (existing) {
    await syncSampleDiscipline(dataSource, existing.id, {
      topLabel: discipline.topLabel,
      confidence: discipline.confidence,
      suggestedLabels: discipline.suggestedLabels,
      disciplines: discipline.disciplines,
      confirmAsAuthor: true,
    });
    if (existing.status === SubmissionStatus.PUBLISHED) {
      return;
    }
    await resumePublishedSampleSeed({
      dataSource,
      submissionsService,
      author,
      authorReq,
      copyeditorReq,
      revisionFilename,
      existing,
      press,
      disciplineLabel: discipline.topLabel,
      logLabel,
    });
    return;
  }

  const s = await submissionsService.create(author.id, {
    title,
    abstract,
    ...samplePublicationMetadata(
      seedJournalId(press, discipline.topLabel),
      publicationMeta,
    ),
  });
  await attachStandardFilePackage(
    submissionsService,
    s.slug!,
    authorReq,
    pdfBytes,
    manuscriptFilename,
  );
  await submissionsService.submit(s.slug!, authorReq);
  await syncSampleDiscipline(dataSource, s.id, {
    topLabel: discipline.topLabel,
    confidence: discipline.confidence,
    suggestedLabels: discipline.suggestedLabels,
    disciplines: discipline.disciplines,
    confirmAsAuthor: true,
  });
  await submissionsService.updateStatus(
    s.slug!,
    editorReq,
    SubmissionStatus.ACCEPTED,
  );
  const ceAssignment = await submissionsService.assignCopyeditor(
    s.slug!,
    copyeditor.id,
    editorReq,
  );
  await submissionsService.submitCopyeditNote(
    ceAssignment.slug!,
    copyeditor.id,
    'Ready for catalog.',
    '',
  );
  await addRevisionManuscriptAfterNote({
    submissionsService,
    submissionSlug: s.slug!,
    authorReq,
    revisionFilename,
    title,
  });
  await submissionsService.markCopyeditAuthorReady(
    ceAssignment.slug!,
    author.id,
  );
  // Publishing requires an issue, so place the article first.
  const issue = await placeSampleForPublication(
    dataSource,
    s.id,
    discipline.topLabel,
    press,
  );
  await submissionsService.publishSubmission(s.slug!, copyeditorReq, issue.id);
  console.log(`Seeded: ${title} (${logLabel})`);
}

/** Published catalog articles. Skipped when `SEED_PERF_FIXTURES=1`. */
export async function seedPublishedSamples(options: {
  ctx: SeedContext;
  author: User;
  authorReq: RequestUser;
  copyeditor: User;
  copyeditorReq: RequestUser;
  press: SeededPress;
  editors: SeedEditorRequests;
}): Promise<void> {
  const skipPublishedForPerf = process.env.SEED_PERF_FIXTURES === '1';
  if (skipPublishedForPerf) {
    return;
  }

  const {
    ctx: { dataSource, submissionsService },
    author,
    authorReq,
    copyeditor,
    copyeditorReq,
    press,
    editors,
  } = options;
  const editorReq = editors.econj;
  const medjEditorReq = editors.medj;

  // 7–9) Published catalog — pub + pub2 share topic/keywords for high embedding similarity
  const tPub = SAMPLE_PUBLISHED_TITLE;
  const tPub2 = SAMPLE_PUBLISHED_PEER_TITLE;
  const tPub3 = SAMPLE_PUBLISHED_MEDICAL_TITLE;

  await seedPublishedSample({
    dataSource,
    submissionsService,
    author,
    authorReq,
    editorReq,
    copyeditor,
    copyeditorReq,
    title: tPub,
    abstract:
      'This study examines the impact of digital publishing policies on knowledge economics in Arabic journals, comparing open-access funding models and article processing charges across peer-reviewed Arabic and international outlets from 2020 to 2024.',
    publicationMeta: SAMPLE_PUB1_META,
    manuscriptFilename: 'published.pdf',
    revisionFilename: 'published-revision.pdf',
    discipline: { topLabel: SAMPLE_DISCIPLINE_DEFAULT, confidence: 90 },
    press,
    logLabel: 'published',
  });

  await seedPublishedSample({
    dataSource,
    submissionsService,
    author,
    authorReq,
    editorReq,
    copyeditor,
    copyeditorReq,
    title: tPub2,
    abstract:
      'This study analyses open-access policies and their effect on knowledge economics in Arabic peer-reviewed journals, applying documentary analysis to publishing policies of ten journals over 2020–2024, with recommendations for expanding access without compromising the sustainability of academic publishing.',
    publicationMeta: SAMPLE_PUB2_META,
    manuscriptFilename: 'published-peer.pdf',
    revisionFilename: 'published-peer-revision.pdf',
    discipline: { topLabel: SAMPLE_DISCIPLINE_DEFAULT, confidence: 88 },
    press,
    logLabel: 'published, related-articles peer',
  });

  await seedPublishedSample({
    dataSource,
    submissionsService,
    author,
    authorReq,
    editorReq: medjEditorReq,
    copyeditor,
    copyeditorReq,
    title: tPub3,
    abstract:
      'This case report discusses the challenges of informed consent and confidentiality in small-sample clinical studies, with a focus on teaching-hospital contexts and practical recommendations for institutional ethics review boards when statistical power is limited.',
    publicationMeta: SAMPLE_PUB3_META,
    manuscriptFilename: 'published-medical.pdf',
    revisionFilename: 'published-medical-revision.pdf',
    discipline: {
      topLabel: SAMPLE_DISCIPLINE_MEDICAL,
      confidence: 85,
      suggestedLabels: [SAMPLE_DISCIPLINE_MEDICAL, 'العلوم الأساسية'],
      disciplines: [SAMPLE_DISCIPLINE_MEDICAL, 'العلوم الأساسية'],
    },
    press,
    logLabel: 'published, related-articles distant peer',
  });
}
