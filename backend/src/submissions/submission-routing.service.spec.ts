import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { JournalSection } from '../entities/journal-section.entity';
import { SectionEditorAssignment } from '../entities/section-editor-assignment.entity';
import { SectionEditorLink } from '../entities/section-editor.entity';
import { Submission } from '../entities/submission.entity';
import { JournalMembershipService } from '../journals/journal-membership.service';
import { ROLE_SLUGS } from '../rbac/permission-slugs';
import { SubmissionRoutingService } from './submission-routing.service';

describe('SubmissionRoutingService', () => {
  let service: SubmissionRoutingService;
  let linksFind: jest.Mock;
  let listUserIdsForJournal: jest.Mock;
  let saved: unknown[];

  const submission = {
    id: 'sub-1',
    journalId: 'journal-econj',
    sectionId: 'section-reviews',
  } as Submission;

  beforeEach(async () => {
    linksFind = jest.fn().mockResolvedValue([]);
    listUserIdsForJournal = jest.fn().mockResolvedValue([]);
    saved = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        SubmissionRoutingService,
        { provide: getRepositoryToken(JournalSection), useValue: {} },
        {
          provide: getRepositoryToken(SectionEditorLink),
          useValue: { find: linksFind },
        },
        {
          provide: getRepositoryToken(SectionEditorAssignment),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: JournalMembershipService,
          useValue: { listUserIdsForJournal },
        },
      ],
    }).compile();
    service = moduleRef.get(SubmissionRoutingService);
  });

  function em(): EntityManager {
    return {
      getRepository: () => ({
        find: jest.fn().mockResolvedValue([]),
        create: (row: unknown) => row,
        save: jest.fn((rows: unknown[]) => {
          saved = rows;
          return Promise.resolve(rows);
        }),
      }),
    } as unknown as EntityManager;
  }

  it('assigns every section editor linked to the section', async () => {
    linksFind.mockResolvedValue([
      { userId: 'se-1', canRecordDecision: true },
      { userId: 'se-2', canRecordDecision: false },
    ]);

    const ids = await service.routeOnSubmit(em(), submission, 'author-1');

    expect(ids).toEqual(['se-1', 'se-2']);
    expect(saved).toEqual([
      expect.objectContaining({
        sectionEditorId: 'se-1',
        canRecordDecision: true,
        assignedById: 'author-1',
      }),
      expect.objectContaining({
        sectionEditorId: 'se-2',
        canRecordDecision: false,
      }),
    ]);
    expect(listUserIdsForJournal).not.toHaveBeenCalled();
  });

  it('assigns the single editor-in-chief when the section has no editor', async () => {
    listUserIdsForJournal.mockImplementation((_journal: string, role: string) =>
      Promise.resolve(role === ROLE_SLUGS.EDITOR ? ['chief-1'] : []),
    );

    const ids = await service.routeOnSubmit(em(), submission, 'author-1');

    expect(ids).toEqual(['chief-1']);
    expect(listUserIdsForJournal).not.toHaveBeenCalledWith(
      submission.journalId,
      ROLE_SLUGS.JOURNAL_MANAGER,
    );
  });

  it('assigns the single journal manager when the chief seat is empty', async () => {
    listUserIdsForJournal.mockImplementation((_journal: string, role: string) =>
      Promise.resolve(role === ROLE_SLUGS.JOURNAL_MANAGER ? ['manager-1'] : []),
    );

    await expect(
      service.routeOnSubmit(em(), submission, 'author-1'),
    ).resolves.toEqual(['manager-1']);
  });

  it('leaves the paper unassigned when both seats are empty', async () => {
    await expect(
      service.routeOnSubmit(em(), submission, 'author-1'),
    ).resolves.toEqual([]);
    expect(saved).toEqual([]);
  });
});
