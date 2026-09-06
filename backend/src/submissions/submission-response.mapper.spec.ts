import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { submissionToViewerJson } from './submission-response.mapper';

describe('submissionToViewerJson messageForAuthor', () => {
  const base = {
    id: 'sub-1',
    slug: 'paper-one',
    title: 'Title',
    titleAr: null,
    abstract: 'Abstract',
    abstractAr: null,
    articleType: null,
    keywords: null,
    keywordsAr: null,
    status: SubmissionStatus.REVISIONS_REQUESTED,
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: null,
    reviewMethod: 'double_anonymous',
    files: [],
    authorId: 'author-1',
    messageForAuthor: 'Please revise section 2.',
  } as unknown as Submission;

  it('exposes messageForAuthor to author and editor viewers', () => {
    expect(submissionToViewerJson(base, 'author').messageForAuthor).toBe(
      'Please revise section 2.',
    );
    expect(submissionToViewerJson(base, 'editor').messageForAuthor).toBe(
      'Please revise section 2.',
    );
  });

  it('hides messageForAuthor from reviewer and copyeditor viewers', () => {
    expect(
      submissionToViewerJson(base, 'reviewer').messageForAuthor,
    ).toBeUndefined();
    expect(
      submissionToViewerJson(base, 'copyeditor').messageForAuthor,
    ).toBeUndefined();
  });
});

describe('submissionToViewerJson preSubmitAnalysis', () => {
  const analysis = {
    id: 'psa-1',
    analyzedAt: '2026-01-01T00:00:00.000Z',
    contentHash: 'abc',
    formatIssues: [],
    grammarNotes: [],
    referenceIssues: [],
    aiUnavailable: false,
    acknowledged: true,
    acknowledgedAt: '2026-01-01T00:00:00.000Z',
  };

  const base = {
    id: 'sub-1',
    slug: 'paper-one',
    title: 'Title',
    titleAr: null,
    abstract: 'Abstract',
    abstractAr: null,
    articleType: null,
    keywords: null,
    keywordsAr: null,
    status: SubmissionStatus.DRAFT,
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: null,
    reviewMethod: 'double_anonymous',
    files: [],
    authorId: 'author-1',
    preSubmitAnalysis: analysis,
  } as unknown as Submission;

  it('exposes preSubmitAnalysis only to authors', () => {
    expect(submissionToViewerJson(base, 'author').preSubmitAnalysis).toEqual(
      analysis,
    );
    expect(
      submissionToViewerJson(base, 'editor').preSubmitAnalysis,
    ).toBeUndefined();
    expect(
      submissionToViewerJson(base, 'reviewer').preSubmitAnalysis,
    ).toBeUndefined();
  });
});

describe('submissionToViewerJson reviewer review files', () => {
  const reviewFile = {
    id: 'file-review-1',
    originalName: 'Dr Amina Haddad - annotated.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'review_response',
    fileStage: 'review',
    isPublic: false,
    reviewAssignmentId: 'asg-2',
    releasedToAuthorAt: null,
  };
  const manuscript = {
    id: 'file-ms-1',
    originalName: 'manuscript.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'manuscript',
    fileStage: 'review',
    isPublic: false,
    reviewAssignmentId: null,
    releasedToAuthorAt: null,
  };
  const assignments = [
    { id: 'asg-1', assignedAt: new Date('2026-01-01'), status: 'completed' },
    { id: 'asg-2', assignedAt: new Date('2026-01-02'), status: 'completed' },
  ];

  function build(files: unknown[]): Submission {
    return {
      id: 'sub-1',
      slug: 'paper-one',
      title: 'Title',
      abstract: 'Abstract',
      status: SubmissionStatus.UNDER_REVIEW,
      authorId: 'author-1',
      files,
      reviewAssignments: assignments,
    } as unknown as Submission;
  }

  function fileKinds(json: Record<string, unknown>): string[] {
    return (json.files as Array<{ kind: string }>).map((f) => f.kind);
  }

  it('hides an unreleased reviewer file from the author', () => {
    const json = submissionToViewerJson(
      build([manuscript, reviewFile]),
      'author',
    );
    expect(fileKinds(json)).toEqual(['manuscript']);
  });

  it('shows a released reviewer file to the author under an anonymized name', () => {
    const released = {
      ...reviewFile,
      releasedToAuthorAt: new Date('2026-02-01'),
    };
    const json = submissionToViewerJson(
      build([manuscript, released]),
      'author',
    );
    const row = (json.files as Array<Record<string, unknown>>).find(
      (f) => f.kind === 'review_response',
    );
    expect(row).toBeDefined();
    // asg-2 is the second assignment by assignedAt, so "Reviewer 2".
    expect(row?.displayName).toBe('Reviewer 2 — review file.docx');
    expect(JSON.stringify(json)).not.toContain('Amina');
  });

  it('never shows a reviewer another reviewer review file', () => {
    // addReviewerFile marks these review-stage, so without an explicit filter
    // every reviewer would see every other reviewer's filename.
    const json = submissionToViewerJson(
      build([manuscript, reviewFile]),
      'reviewer',
    );
    expect(fileKinds(json)).toEqual(['manuscript']);
  });

  it('gives editors the real filename and the owning assignment', () => {
    const json = submissionToViewerJson(build([reviewFile]), 'editor');
    const row = (json.files as Array<Record<string, unknown>>)[0];
    expect(row.originalName).toBe('Dr Amina Haddad - annotated.docx');
    expect(row.reviewAssignmentId).toBe('asg-2');
    expect(row.displayName).toBeUndefined();
  });
});

describe('submissionToViewerJson author review progress', () => {
  const base = {
    id: 'sub-1',
    slug: 'paper-one',
    title: 'Title',
    abstract: 'Abstract',
    status: SubmissionStatus.UNDER_REVIEW,
    authorId: 'author-1',
    files: [],
    revisionSeverity: 'major',
    revisionRound: 2,
    reviewAssignments: [
      {
        id: 'asg-b',
        assignedAt: new Date('2026-01-05'),
        respondedAt: new Date('2026-01-06'),
        reviewDueAt: new Date('2026-02-01'),
        status: 'accepted',
        reviewerId: 'reviewer-b',
        reviewer: { id: 'reviewer-b', displayName: 'Prof Karim Nasser' },
        review: null,
      },
      {
        id: 'asg-a',
        assignedAt: new Date('2026-01-01'),
        respondedAt: new Date('2026-01-02'),
        reviewDueAt: new Date('2026-01-20'),
        status: 'completed',
        reviewerId: 'reviewer-a',
        reviewer: { id: 'reviewer-a', displayName: 'Dr Amina Haddad' },
        review: {
          submittedAt: new Date('2026-01-18'),
          recommendation: 'major_revisions',
          commentsToEditorOnly: 'Weak methodology, but do not tell the author.',
        },
      },
    ],
  } as unknown as Submission;

  it('orders reviewers by assignedAt, not by array order', () => {
    const json = submissionToViewerJson(base, 'author');
    const rows = json.reviewProgress as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.index)).toEqual([1, 2]);
    expect(rows[0].status).toBe('completed');
    expect(rows[1].status).toBe('accepted');
  });

  it('never leaks reviewer identity, recommendation, or confidential comments', () => {
    const serialized = JSON.stringify(
      (submissionToViewerJson(base, 'author') as { reviewProgress: unknown })
        .reviewProgress,
    );
    expect(serialized).not.toContain('Amina');
    expect(serialized).not.toContain('Karim');
    expect(serialized).not.toContain('reviewer-a');
    expect(serialized).not.toContain('major_revisions');
    expect(serialized).not.toContain('methodology');
  });

  it('summarises progress by assignment state', () => {
    const json = submissionToViewerJson(base, 'author');
    expect(json.reviewProgressSummary).toEqual({
      invited: 0,
      accepted: 1,
      declined: 0,
      completed: 1,
    });
  });

  it('exposes revision severity and round to the author and editor only', () => {
    expect(submissionToViewerJson(base, 'author').revisionSeverity).toBe(
      'major',
    );
    expect(submissionToViewerJson(base, 'editor').revisionRound).toBe(2);
    expect(
      submissionToViewerJson(base, 'reviewer').revisionSeverity,
    ).toBeUndefined();
  });

  it('does not attach review progress for non-author viewers', () => {
    expect(
      submissionToViewerJson(base, 'editor').reviewProgress,
    ).toBeUndefined();
    expect(
      submissionToViewerJson(base, 'reviewer').reviewProgress,
    ).toBeUndefined();
  });
});
