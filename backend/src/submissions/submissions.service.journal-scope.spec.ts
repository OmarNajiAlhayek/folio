import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { SubmissionLifecycleService } from './submission-lifecycle.service';
import { ReviewWorkflowService } from './review-workflow.service';
import { CopyeditWorkflowService } from './copyedit-workflow.service';
import { SubmissionFileService } from './submission-file.service';
import { SubmissionAiService } from './submission-ai.service';
import { ReviewDiscussionService } from './review-discussion.service';
import {
  getSubmissionTestServices,
  submissionsServiceTestProviders,
} from './submissions-service.testing';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SubmissionDisciplineSource } from '../entities/submission-discipline-source.enum';
import { SubmissionReviewMethod } from '../entities/submission-review-method.enum';
import { SubmissionFileStage } from '../entities/submission-file-stage.enum';
import { AssignmentStatus } from '../entities/review-assignment.entity';
import { CopyeditAssignmentStatus } from '../entities/copyedit-assignment.entity';
import { ReviewDiscussion } from '../entities/review-discussion.entity';
import { ReviewDiscussionMessage } from '../entities/review-discussion-message.entity';
import { PERMISSION_SLUGS, ROLE_SLUGS } from '../rbac/permission-slugs';
import type { RequestUser } from '../common/types/request-user';

/**
 * Journal scope on one submission, not only on the queue. The queue spec
 * covers the list predicate; this one covers `assertCanRead` and the staff
 * mutations that load a submission by slug.
 */
describe('Submission journal scope', () => {
  const JOURNAL = 'journal-medj';
  const OTHER = 'journal-engj';

  const submission = {
    id: 'sub-1',
    slug: 'paper-one',
    title: 'Paper',
    authorId: 'author-1',
    journalId: JOURNAL,
    status: SubmissionStatus.SUBMITTED,
    disciplines: [] as string[],
    disciplineSource: null,
  } as Submission;

  const staffPerms = [
    PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
    PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
    PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER,
    PERMISSION_SLUGS.SUBMISSION_ASSIGN_COPYEDITOR,
    PERMISSION_SLUGS.COPYEDIT_PUBLISH,
    PERMISSION_SLUGS.SUBMISSION_ASSIGN_SECTION_EDITOR,
  ];

  const user = (
    sub: string,
    roleSlugs: string[],
    permissionSlugs: string[],
  ): RequestUser => ({
    sub,
    email: `${sub}@folio.dev`,
    roleSlugs,
    permissionSlugs,
  });

  const editorMedj = user('editor-medj', [ROLE_SLUGS.EDITOR], staffPerms);
  const editorEngj = user('editor-engj', [ROLE_SLUGS.EDITOR], staffPerms);
  const editorNone = user('editor-none', [ROLE_SLUGS.EDITOR], staffPerms);
  const manager = user(
    'manager-1',
    [ROLE_SLUGS.JOURNAL_MANAGER],
    [
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
      PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
    ],
  );
  const sectionEditor = user(
    'se-1',
    [ROLE_SLUGS.SECTION_EDITOR],
    [
      PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE,
      PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
      PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER,
    ],
  );
  const otherSectionEditor = user(
    'se-2',
    [ROLE_SLUGS.SECTION_EDITOR],
    sectionEditor.permissionSlugs,
  );
  const author = user(
    'author-1',
    [ROLE_SLUGS.AUTHOR],
    [PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN],
  );
  const reviewer = user(
    'reviewer-1',
    [ROLE_SLUGS.REVIEWER],
    [PERMISSION_SLUGS.REVIEW_SUBMIT, PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN],
  );
  const editorReviewer = user(
    'reviewer-1',
    [ROLE_SLUGS.EDITOR],
    [...staffPerms, PERMISSION_SLUGS.REVIEW_SUBMIT],
  );
  const copyeditor = user(
    'ce-1',
    [ROLE_SLUGS.COPYEDITOR],
    [PERMISSION_SLUGS.COPYEDIT_SUBMIT_NOTE, PERMISSION_SLUGS.COPYEDIT_PUBLISH],
  );

  let service: SubmissionsService;
  let lifecycle: SubmissionLifecycleService;
  let reviewWorkflow: ReviewWorkflowService;
  let copyedit: CopyeditWorkflowService;
  let files: SubmissionFileService;
  let ai: SubmissionAiService;
  let discussions: ReviewDiscussionService;
  let listJournalIdsForUser: jest.Mock;
  let filesCount: jest.Mock;
  let filesFindOne: jest.Mock;
  let submissionsSave: jest.Mock;
  let usersFindOne: jest.Mock;
  let userHasPermission: jest.Mock;
  let transaction: jest.Mock;
  let copyeditFind: jest.Mock;
  let discussionsFind: jest.Mock;

  beforeAll(async () => {
    listJournalIdsForUser = jest.fn((userId: string, role: string) => {
      if (role === ROLE_SLUGS.SECTION_EDITOR) {
        if (userId === sectionEditor.sub) return Promise.resolve([JOURNAL]);
        if (userId === otherSectionEditor.sub) return Promise.resolve([OTHER]);
        return Promise.resolve([]);
      }
      if (role === ROLE_SLUGS.JOURNAL_MANAGER) {
        if (userId === manager.sub) return Promise.resolve([JOURNAL]);
        return Promise.resolve([]);
      }
      if (role !== ROLE_SLUGS.EDITOR) return Promise.resolve([]);
      if (userId === editorMedj.sub) return Promise.resolve([JOURNAL]);
      if (userId === editorEngj.sub) return Promise.resolve([OTHER]);
      return Promise.resolve([]);
    });
    filesCount = jest.fn().mockResolvedValue(0);
    filesFindOne = jest.fn().mockResolvedValue(null);
    submissionsSave = jest.fn((row: Submission) => Promise.resolve(row));
    usersFindOne = jest.fn().mockResolvedValue(null);
    userHasPermission = jest.fn().mockResolvedValue(false);
    transaction = jest.fn(() => Promise.reject(new Error('reached-write')));
    copyeditFind = jest.fn().mockResolvedValue([]);
    discussionsFind = jest.fn().mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ...submissionsServiceTestProviders({
          submissionsRepo: {
            findOne: jest.fn((opts: { where?: { slug?: string } }) =>
              Promise.resolve(
                opts?.where?.slug === submission.slug ? submission : null,
              ),
            ),
            save: submissionsSave,
            manager: { transaction },
          },
          filesRepo: {
            count: filesCount,
            findOne: filesFindOne,
            save: jest.fn((row: unknown) => Promise.resolve(row)),
          },
          assignmentsRepo: {
            exists: jest.fn((opts: { where?: { reviewerId?: string } }) =>
              Promise.resolve(opts?.where?.reviewerId === reviewer.sub),
            ),
            findOne: jest.fn((opts: { where?: { slug?: string } }) => {
              if (opts?.where?.slug !== 'asg-1') return Promise.resolve(null);
              return Promise.resolve({
                id: 'asg-1',
                slug: 'asg-1',
                reviewerId: reviewer.sub,
                status: AssignmentStatus.ACCEPTED,
                submission,
              });
            }),
          },
          copyeditAssignmentsRepo: {
            exists: jest.fn((opts: { where?: { copyeditorId?: string } }) =>
              Promise.resolve(opts?.where?.copyeditorId === copyeditor.sub),
            ),
            find: copyeditFind,
            findOne: jest.fn().mockResolvedValue(null),
          },
          usersRepo: { findOne: usersFindOne },
          sectionEditorAssignmentsRepo: {
            exists: jest.fn((opts: { where?: { sectionEditorId?: string } }) =>
              Promise.resolve(
                opts?.where?.sectionEditorId === sectionEditor.sub,
              ),
            ),
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn((opts: { where?: { sectionEditorId?: string } }) =>
              Promise.resolve(
                opts?.where?.sectionEditorId === sectionEditor.sub
                  ? { id: 'sea-1', canRecordDecision: true }
                  : null,
              ),
            ),
            delete: jest.fn(),
          },
          journalMembershipService: {
            listJournalIdsForUser,
            filterUserIdsInJournal: jest.fn().mockResolvedValue([]),
            disciplineLabelForJournal: jest.fn().mockResolvedValue(null),
          },
          journalIssuesService: {
            listPublishableIssues: jest.fn().mockResolvedValue([]),
            getIssueAcceptingArticleOrThrow: jest
              .fn()
              .mockResolvedValue({ id: 'issue-1', journalId: JOURNAL }),
          },
          rbacService: { userHasPermission },
        }),
        ReviewDiscussionService,
        {
          provide: getRepositoryToken(ReviewDiscussion),
          useValue: {
            find: discussionsFind,
            create: jest.fn((row: object) => ({ id: 'disc-1', ...row })),
            save: jest.fn((row: object) => Promise.resolve(row)),
            findOneOrFail: jest.fn(() =>
              Promise.resolve({
                id: 'disc-1',
                assignmentId: 'asg-1',
                subject: 'Note',
                messages: [],
              }),
            ),
          },
        },
        {
          provide: getRepositoryToken(ReviewDiscussionMessage),
          useValue: {
            create: jest.fn((row: object) => row),
            save: jest.fn((row: object) => Promise.resolve(row)),
          },
        },
      ],
    }).compile();

    const services = getSubmissionTestServices(moduleRef);
    service = services.service;
    lifecycle = services.lifecycle;
    reviewWorkflow = services.reviewWorkflow;
    copyedit = services.copyeditWorkflow;
    files = services.files;
    ai = services.ai;
    discussions = moduleRef.get(ReviewDiscussionService);
  });

  beforeEach(() => {
    submission.status = SubmissionStatus.SUBMITTED;
    submission.disciplines = [];
    submission.disciplineSource = null;
    jest.clearAllMocks();
    filesCount.mockResolvedValue(0);
    filesFindOne.mockResolvedValue(null);
    usersFindOne.mockResolvedValue(null);
    userHasPermission.mockResolvedValue(false);
    copyeditFind.mockResolvedValue([]);
    discussionsFind.mockResolvedValue([]);
  });

  async function expectOutOfScope(work: Promise<unknown>): Promise<void> {
    try {
      await work;
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as {
        code?: string;
      };
      expect(body.code).toBe('JOURNAL_OUT_OF_SCOPE');
      return;
    }
    throw new Error('expected JOURNAL_OUT_OF_SCOPE');
  }

  async function expectErrorCode(
    work: Promise<unknown>,
    code: string,
  ): Promise<void> {
    try {
      await work;
    } catch (err) {
      const body = (
        err as { getResponse: () => { code?: string } }
      ).getResponse();
      expect(body.code).toBe(code);
      return;
    }
    throw new Error(`expected ${code}`);
  }

  describe('assertCanRead', () => {
    it('lets the journal manager of that journal read it', async () => {
      await expect(
        service.assertCanRead(submission, manager),
      ).resolves.toBeUndefined();
      expect(listJournalIdsForUser).toHaveBeenCalledWith(
        manager.sub,
        ROLE_SLUGS.JOURNAL_MANAGER,
      );
    });

    it('lets an editor read a submission in a journal they serve', async () => {
      await expect(
        service.assertCanRead(submission, editorMedj),
      ).resolves.toBeUndefined();
      expect(listJournalIdsForUser).toHaveBeenCalledWith(
        editorMedj.sub,
        ROLE_SLUGS.EDITOR,
      );
    });

    it('refuses an editor of a different journal', async () => {
      await expectOutOfScope(service.assertCanRead(submission, editorEngj));
    });

    it('refuses an editor with no memberships', async () => {
      await expectOutOfScope(service.assertCanRead(submission, editorNone));
    });

    it('still hides drafts from an in-scope editor', async () => {
      submission.status = SubmissionStatus.DRAFT;
      await expect(
        service.assertCanRead(submission, editorMedj),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(listJournalIdsForUser).not.toHaveBeenCalled();
    });

    it('still lets the author read, including an editor who wrote it', async () => {
      await expect(
        service.assertCanRead(submission, author),
      ).resolves.toBeUndefined();
      const editorAuthor = user('author-1', [ROLE_SLUGS.EDITOR], staffPerms);
      await expect(
        service.assertCanRead(submission, editorAuthor),
      ).resolves.toBeUndefined();
    });

    it('still lets an assigned reviewer read, including an editor with no journal membership', async () => {
      await expect(
        service.assertCanRead(submission, reviewer),
      ).resolves.toBeUndefined();
      await expect(
        service.assertCanRead(submission, editorReviewer),
      ).resolves.toBeUndefined();
    });

    it('still lets the assigned copyeditor read', async () => {
      await expect(
        service.assertCanRead(submission, copyeditor),
      ).resolves.toBeUndefined();
    });

    it('lets an assigned section editor read and refuses one who is not assigned', async () => {
      await expect(
        service.assertCanRead(submission, sectionEditor),
      ).resolves.toBeUndefined();
      await expect(
        service.assertCanRead(submission, otherSectionEditor),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('staff mutations', () => {
    it('scopes a status change to the editor of that journal', async () => {
      await expectOutOfScope(
        lifecycle.updateStatus(
          submission.slug,
          editorEngj,
          SubmissionStatus.UNDER_REVIEW,
        ),
      );
      expect(filesCount).not.toHaveBeenCalled();

      await expectErrorCode(
        lifecycle.updateStatus(
          submission.slug,
          editorMedj,
          SubmissionStatus.UNDER_REVIEW,
        ),
        'REVIEW_PACKAGE_INCOMPLETE',
      );
      expect(filesCount).toHaveBeenCalled();
    });

    it('lets the journal manager of that journal change status', async () => {
      await expectErrorCode(
        lifecycle.updateStatus(
          submission.slug,
          manager,
          SubmissionStatus.UNDER_REVIEW,
        ),
        'REVIEW_PACKAGE_INCOMPLETE',
      );
      expect(listJournalIdsForUser).toHaveBeenCalledWith(
        manager.sub,
        ROLE_SLUGS.JOURNAL_MANAGER,
      );
    });

    it('lets an assigned section editor change status and refuses one who is not assigned', async () => {
      await expectOutOfScope(
        lifecycle.updateStatus(
          submission.slug,
          otherSectionEditor,
          SubmissionStatus.UNDER_REVIEW,
        ),
      );
      expect(filesCount).not.toHaveBeenCalled();

      await expectErrorCode(
        lifecycle.updateStatus(
          submission.slug,
          sectionEditor,
          SubmissionStatus.UNDER_REVIEW,
        ),
        'REVIEW_PACKAGE_INCOMPLETE',
      );
    });

    it('scopes reviewer assignment the same way', async () => {
      await expectOutOfScope(
        reviewWorkflow.assignReviewer(
          submission.slug,
          'rev-x',
          otherSectionEditor,
        ),
      );
      await expectOutOfScope(
        reviewWorkflow.assignReviewer(submission.slug, 'rev-x', editorNone),
      );
      expect(usersFindOne).not.toHaveBeenCalled();

      await expectErrorCode(
        reviewWorkflow.assignReviewer(submission.slug, 'rev-x', editorMedj),
        'VALIDATION_ERROR',
      );
      expect(usersFindOne).toHaveBeenCalled();
    });

    it('scopes review method, file stage, and review-file release', async () => {
      await expectOutOfScope(
        reviewWorkflow.updateReviewMethod(
          submission.slug,
          editorEngj,
          SubmissionReviewMethod.ANONYMOUS,
        ),
      );
      expect(submissionsSave).not.toHaveBeenCalled();
      await reviewWorkflow.updateReviewMethod(
        submission.slug,
        sectionEditor,
        SubmissionReviewMethod.ANONYMOUS,
      );
      expect(submissionsSave).toHaveBeenCalled();

      filesFindOne.mockClear();
      await expectOutOfScope(
        reviewWorkflow.updateSubmissionFileStage(
          submission.slug,
          'file-1',
          editorNone,
          SubmissionFileStage.REVIEW,
        ),
      );
      await expectOutOfScope(
        files.setReviewFileRelease(submission.slug, 'file-1', editorNone, true),
      );
      expect(filesFindOne).not.toHaveBeenCalled();
      await expect(
        files.setReviewFileRelease(submission.slug, 'file-1', editorMedj, true),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(filesFindOne).toHaveBeenCalled();
    });

    it('scopes copyeditor assignment', async () => {
      await expectOutOfScope(
        copyedit.assignCopyeditor(submission.slug, 'ce-1', editorEngj),
      );
      await expectErrorCode(
        copyedit.assignCopyeditor(submission.slug, 'ce-1', editorMedj),
        'VALIDATION_ERROR',
      );
    });

    it('scopes an editor publish and leaves the assigned copyeditor alone', async () => {
      submission.status = SubmissionStatus.COPYEDITING;
      copyeditFind.mockResolvedValue([
        {
          copyeditorId: copyeditor.sub,
          status: CopyeditAssignmentStatus.READY_FOR_REVIEW,
        },
      ]);

      await expectOutOfScope(
        copyedit.publishSubmission(submission.slug, editorEngj, 'issue-1'),
      );
      expect(transaction).not.toHaveBeenCalled();

      await expect(
        copyedit.publishSubmission(submission.slug, copyeditor, 'issue-1'),
      ).rejects.toThrow('reached-write');
      expect(transaction).toHaveBeenCalled();
    });

    it('scopes retraction', async () => {
      await expectOutOfScope(
        copyedit.retractSubmission(submission.slug, editorNone),
      );
      await expectErrorCode(
        copyedit.retractSubmission(submission.slug, editorMedj),
        'VALIDATION_ERROR',
      );
    });

    it('lets the author set disciplines and scopes the editor', async () => {
      submission.status = SubmissionStatus.DRAFT;
      const saved = await ai.setDisciplineForUser(submission.slug, author, [
        'العلوم الطبية',
      ]);
      expect(saved.disciplineSource).toBe(SubmissionDisciplineSource.AUTHOR);
      expect(listJournalIdsForUser).not.toHaveBeenCalled();

      submission.status = SubmissionStatus.SUBMITTED;
      await expectOutOfScope(
        ai.setDisciplineForUser(submission.slug, editorEngj, ['العلوم الطبية']),
      );
      const edited = await ai.setDisciplineForUser(
        submission.slug,
        editorMedj,
        ['العلوم الطبية'],
      );
      expect(edited.disciplineSource).toBe(SubmissionDisciplineSource.EDITOR);
    });

    it('scopes an editor discussion and still lets the reviewer open one', async () => {
      await expectOutOfScope(
        discussions.createDiscussion(
          'asg-1',
          editorEngj,
          'Question',
          'Please clarify the method.',
        ),
      );
      expect(discussionsFind).not.toHaveBeenCalled();

      await expect(
        discussions.listDiscussions('asg-1', reviewer),
      ).resolves.toEqual([]);
      await expect(
        discussions.createDiscussion(
          'asg-1',
          editorReviewer,
          'From the reviewer',
          'I am the assigned reviewer.',
        ),
      ).resolves.toMatchObject({ id: 'disc-1' });

      await expect(
        discussions.listDiscussions('asg-1', editorMedj),
      ).resolves.toEqual([]);
    });
  });
});
