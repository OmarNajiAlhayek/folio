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
 */
describe('SubmissionsService journal-scoped editor queue', () => {
  let service: SubmissionsService;
  let qb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };
  let listJournalIdsForUser: jest.Mock;

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

    const moduleRef = await Test.createTestingModule({
      providers: submissionsServiceTestProviders({
        submissionsRepo: { createQueryBuilder: jest.fn(() => qb) },
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

  it('limits an editor to the journals they are a member of', async () => {
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

  it('keeps unplaced submissions visible so they can still be triaged', async () => {
    listJournalIdsForUser.mockResolvedValue(['journal-medj']);

    await service.findAllForUser(editor());

    const scoped = predicates().find((p) => p.includes('journal_id'));
    expect(scoped).toContain('s.journal_id IS NULL OR');
  });

  it('scopes an editor with no memberships to unplaced submissions only', async () => {
    listJournalIdsForUser.mockResolvedValue([]);

    await service.findAllForUser(editor());

    expect(predicates()).toContain('s.journal_id IS NULL');
  });

  it('leaves the journal_manager queue unscoped', async () => {
    await service.findAllForUser(
      editor([ROLE_SLUGS.EDITOR, ROLE_SLUGS.JOURNAL_MANAGER]),
    );

    expect(listJournalIdsForUser).not.toHaveBeenCalled();
    expect(predicates().some((p) => p.includes('journal_id'))).toBe(false);
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
