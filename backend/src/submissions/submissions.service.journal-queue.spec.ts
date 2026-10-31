import { Test } from '@nestjs/testing';
import { SubmissionsService } from './submissions.service';
import {
  getSubmissionTestServices,
  submissionsServiceTestProviders,
} from './submissions-service.testing';
import { PERMISSION_SLUGS, ROLE_SLUGS } from '../rbac/permission-slugs';
import type { RequestUser } from '../common/types/request-user';

/**
 * Slice 3: `GET /submissions` is scoped to the journals a staff user actually
 * serves. Asserted at the query-builder level because the interesting part is
 * the predicate, not the rows Postgres would return.
 *
 * Slice 6 removed the `journal_id IS NULL` triage bucket: the column is NOT
 * NULL, so there is nothing unplaced left to fall back to.
 */
describe('SubmissionsService journal-scoped editor queue', () => {
  let service: SubmissionsService;
  let moduleRef: Awaited<
    ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>
  >;
  let qb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };
  let listJournalIdsForUser: jest.Mock;
  let assignmentFind: jest.Mock;

  const editor = (roleSlugs: string[] = [ROLE_SLUGS.EDITOR]): RequestUser => ({
    sub: 'editor-1',
    email: 'editor@folio.dev',
    roleSlugs,
    permissionSlugs: [PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE],
  });

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    listJournalIdsForUser = jest.fn().mockResolvedValue([]);
    assignmentFind = jest.fn().mockResolvedValue([]);

    moduleRef = await Test.createTestingModule({
      providers: submissionsServiceTestProviders({
        submissionsRepo: { createQueryBuilder: jest.fn(() => qb) },
        sectionEditorAssignmentsRepo: {
          exists: jest.fn().mockResolvedValue(false),
          find: assignmentFind,
          findOne: jest.fn().mockResolvedValue(null),
        },
        journalMembershipService: {
          listJournalIdsForUser,
          filterUserIdsInJournal: jest.fn().mockResolvedValue([]),
          disciplineLabelsByUser: jest.fn().mockResolvedValue(new Map()),
          disciplineLabelForJournal: jest.fn().mockResolvedValue(null),
        },
      }),
    }).compile();

    service = getSubmissionTestServices(moduleRef).service;
  });

  /** The `andWhere` predicates applied after the base status filter. */
  function predicates(): string[] {
    const calls = qb.andWhere.mock.calls as unknown[][];
    return calls.map((c) => String(c[0]));
  }

  it('limits a section editor to the papers assigned to them', async () => {
    const sectionEditor: RequestUser = {
      sub: 'section-1',
      email: 'section.eduj@folio.dev',
      roleSlugs: [ROLE_SLUGS.SECTION_EDITOR],
      permissionSlugs: [PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE],
    };
    assignmentFind.mockResolvedValue([{ submissionId: 'paper-1' }]);

    await service.findAllForUser(sectionEditor);

    expect(listJournalIdsForUser).not.toHaveBeenCalled();
    expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), {
      assignedIds: ['paper-1'],
    });
  });

  it('still shows an editor-in-chief every paper in their journal', async () => {
    listJournalIdsForUser.mockResolvedValue(['journal-medj', 'journal-engj']);

    await service.findAllForUser(editor());

    expect(listJournalIdsForUser).toHaveBeenCalledWith(
      'editor-1',
      ROLE_SLUGS.EDITOR,
    );
    const scoped = predicates().find((p) => p.includes('journal_id'));
    expect(scoped).toContain('s.journal_id IN (:...journalIds)');
    expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), {
      journalIds: ['journal-medj', 'journal-engj'],
    });
  });

  it('no longer keeps an unplaced bucket now that every submission has a journal', async () => {
    listJournalIdsForUser.mockResolvedValue(['journal-medj']);

    await service.findAllForUser(editor());

    expect(predicates().some((p) => p.includes('IS NULL'))).toBe(false);
  });

  it('shows an editor with no memberships nothing at all', async () => {
    listJournalIdsForUser.mockResolvedValue([]);

    await expect(service.findAllForUser(editor())).resolves.toEqual([]);

    // Empty scope short-circuits: `IN ()` is not valid SQL, and there is no
    // longer a NULL bucket that would justify running the query anyway.
    expect(qb.getMany).not.toHaveBeenCalled();
  });

  it('scopes a journal manager to the journals they manage', async () => {
    listJournalIdsForUser.mockImplementation((_userId: string, role: string) =>
      Promise.resolve(
        role === ROLE_SLUGS.JOURNAL_MANAGER ? ['journal-econj'] : [],
      ),
    );

    await service.findAllForUser(editor([ROLE_SLUGS.JOURNAL_MANAGER]));

    expect(listJournalIdsForUser).toHaveBeenCalledWith(
      'editor-1',
      ROLE_SLUGS.JOURNAL_MANAGER,
    );
    expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), {
      journalIds: ['journal-econj'],
    });
  });

  it('still applies the status filter alongside the journal scope', async () => {
    listJournalIdsForUser.mockResolvedValue(['journal-medj']);

    await service.findAllForUser(editor(), 'submitted' as never);

    expect(predicates().some((p) => p.includes('s.status = :status'))).toBe(
      true,
    );
    expect(predicates().some((p) => p.includes('journal_id'))).toBe(true);
  });
});
