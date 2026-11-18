import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Journal } from '../entities/journal.entity';
import { JournalSection } from '../entities/journal-section.entity';
import { SectionEditorAssignment } from '../entities/section-editor-assignment.entity';
import { SectionEditorLink } from '../entities/section-editor.entity';
import { Submission } from '../entities/submission.entity';
import { ROLE_SLUGS } from '../rbac/permission-slugs';
import { JournalMembershipService } from './journal-membership.service';
import { StaffReleaseService } from './staff-release.service';

const USER = 'user-1';
const JOURNAL = 'journal-a';

describe('StaffReleaseService', () => {
  let service: StaffReleaseService;
  let linksDelete: jest.Mock;
  let assignmentsFind: jest.Mock;
  let assignmentsDelete: jest.Mock;
  let assignmentsCount: jest.Mock;
  let assignmentsSave: jest.Mock;
  let submissionsFind: jest.Mock;
  let filterUserIdsInJournal: jest.Mock;
  let filterStaffUserIdsInJournal: jest.Mock;
  let listUserIdsForJournal: jest.Mock;
  let linksFind: jest.Mock;

  beforeEach(async () => {
    linksDelete = jest.fn().mockResolvedValue(undefined);
    linksFind = jest.fn().mockResolvedValue([]);
    assignmentsFind = jest.fn().mockResolvedValue([]);
    assignmentsDelete = jest.fn().mockResolvedValue(undefined);
    assignmentsCount = jest.fn().mockResolvedValue(0);
    assignmentsSave = jest.fn().mockResolvedValue(undefined);
    submissionsFind = jest.fn().mockResolvedValue([]);
    // By default the person holds no seat on the journal any more.
    filterUserIdsInJournal = jest.fn().mockResolvedValue([]);
    filterStaffUserIdsInJournal = jest.fn().mockResolvedValue([]);
    listUserIdsForJournal = jest.fn().mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        StaffReleaseService,
        {
          provide: getRepositoryToken(Journal),
          useValue: {
            find: jest.fn().mockResolvedValue([{ id: JOURNAL }, { id: 'b' }]),
          },
        },
        {
          provide: getRepositoryToken(JournalSection),
          useValue: { find: jest.fn().mockResolvedValue([{ id: 'sec-1' }]) },
        },
        {
          provide: getRepositoryToken(SectionEditorLink),
          useValue: { find: linksFind, delete: linksDelete },
        },
        {
          provide: getRepositoryToken(SectionEditorAssignment),
          useValue: {
            find: assignmentsFind,
            delete: assignmentsDelete,
            count: assignmentsCount,
            save: assignmentsSave,
            create: (row: unknown) => row,
          },
        },
        {
          provide: getRepositoryToken(Submission),
          useValue: { find: submissionsFind },
        },
        {
          provide: JournalMembershipService,
          useValue: {
            filterUserIdsInJournal,
            filterStaffUserIdsInJournal,
            listUserIdsForJournal,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(StaffReleaseService);
  });

  const paper = { id: 'paper-1', journalId: JOURNAL, sectionId: 'sec-1' };

  it('removes section links and open-paper assignments, then reroutes to the chief', async () => {
    submissionsFind.mockResolvedValue([paper]);
    assignmentsFind.mockResolvedValue([{ id: 'a1', submissionId: 'paper-1' }]);
    listUserIdsForJournal.mockImplementation((_j: string, role: string) =>
      Promise.resolve(role === ROLE_SLUGS.EDITOR ? ['chief-1'] : []),
    );

    await service.releaseUserFromJournals(USER, [JOURNAL], 'manager-1');

    expect(linksDelete).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER }),
    );
    expect(assignmentsDelete).toHaveBeenCalled();
    expect(assignmentsSave).toHaveBeenCalledWith([
      expect.objectContaining({
        submissionId: 'paper-1',
        sectionEditorId: 'chief-1',
        assignedById: 'manager-1',
        canRecordDecision: true,
      }),
    ]);
  });

  it('keeps assignments while the person still holds another seat on the journal', async () => {
    filterStaffUserIdsInJournal.mockResolvedValue([USER]);

    await service.releaseUserFromJournals(USER, [JOURNAL]);

    expect(assignmentsDelete).not.toHaveBeenCalled();
    expect(assignmentsSave).not.toHaveBeenCalled();
  });

  it('keeps section links while the person is still a section editor there', async () => {
    filterUserIdsInJournal.mockResolvedValue([USER]);
    filterStaffUserIdsInJournal.mockResolvedValue([USER]);

    await service.releaseUserFromJournals(USER, [JOURNAL]);

    expect(linksDelete).not.toHaveBeenCalled();
  });

  it('does not reroute a paper that still has another assignee', async () => {
    submissionsFind.mockResolvedValue([paper]);
    assignmentsFind.mockResolvedValue([{ id: 'a1', submissionId: 'paper-1' }]);
    assignmentsCount.mockResolvedValue(1);

    await service.releaseUserFromJournals(USER, [JOURNAL]);

    expect(assignmentsDelete).toHaveBeenCalled();
    expect(assignmentsSave).not.toHaveBeenCalled();
  });

  it('leaves a paper unassigned when nobody holds a seat to take it', async () => {
    submissionsFind.mockResolvedValue([paper]);
    assignmentsFind.mockResolvedValue([{ id: 'a1', submissionId: 'paper-1' }]);

    await service.releaseUserFromJournals(USER, [JOURNAL]);

    expect(assignmentsDelete).toHaveBeenCalled();
    expect(assignmentsSave).not.toHaveBeenCalled();
  });

  it('checks every journal when a role is taken away everywhere', async () => {
    await service.releaseUserFromAllJournals(USER);

    expect(filterStaffUserIdsInJournal).toHaveBeenCalledTimes(2);
  });
});
