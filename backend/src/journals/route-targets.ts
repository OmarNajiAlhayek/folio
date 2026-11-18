import type { Repository } from 'typeorm';
import type { SectionEditorLink } from '../entities/section-editor.entity';
import { ROLE_SLUGS } from '../rbac/permission-slugs';
import type { JournalMembershipService } from './journal-membership.service';

export type RouteTarget = { userId: string; canRecordDecision: boolean };

/**
 * Who a paper is handed to, in OJS order: every section editor linked to the
 * section; otherwise the single editor-in-chief; otherwise the single journal
 * manager; otherwise nobody.
 *
 * Only people who still hold a seat on the paper's journal count. A link, or a
 * seat, left behind after a role was taken away must not keep receiving that
 * journal's mail.
 */
export async function resolveRouteTargets(
  deps: {
    linksRepo: Repository<SectionEditorLink>;
    memberships: Pick<
      JournalMembershipService,
      'listUserIdsForJournal' | 'filterUserIdsInJournal'
    >;
  },
  submission: { sectionId: string | null; journalId: string },
): Promise<RouteTarget[]> {
  if (submission.sectionId) {
    const links = await deps.linksRepo.find({
      where: { sectionId: submission.sectionId },
    });
    if (links.length > 0) {
      const seated = new Set(
        await deps.memberships.filterUserIdsInJournal(
          links.map((link) => link.userId),
          submission.journalId,
          ROLE_SLUGS.SECTION_EDITOR,
        ),
      );
      const valid = links.filter((link) => seated.has(link.userId));
      // Links exist but nobody on them is still seated: fall through to the
      // chief and manager rather than leave the paper unassigned.
      if (valid.length > 0) {
        return valid.map((link) => ({
          userId: link.userId,
          canRecordDecision: link.canRecordDecision,
        }));
      }
    }
  }
  if (!submission.sectionId) return [];
  const chiefs = await deps.memberships.listUserIdsForJournal(
    submission.journalId,
    ROLE_SLUGS.EDITOR,
  );
  if (chiefs.length === 1) {
    return [{ userId: chiefs[0], canRecordDecision: true }];
  }
  if (chiefs.length > 1) return [];
  const managers = await deps.memberships.listUserIdsForJournal(
    submission.journalId,
    ROLE_SLUGS.JOURNAL_MANAGER,
  );
  if (managers.length === 1) {
    return [{ userId: managers[0], canRecordDecision: true }];
  }
  return [];
}
