import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { Journal } from '../entities/journal.entity';
import { JournalMembership } from '../entities/journal-membership.entity';
import { ROLE_SLUGS } from '../rbac/permission-slugs';

/** One person per journal. Section editor, reviewer, and copyeditor are not in this set. */
const ONE_PER_JOURNAL_ROLES = new Set<string>([
  ROLE_SLUGS.EDITOR,
  ROLE_SLUGS.JOURNAL_MANAGER,
]);

const ONE_PER_JOURNAL_INDEXES = new Set([
  'uq_journal_memberships_one_editor',
  'uq_journal_memberships_one_journal_manager',
]);

export type JournalRoleHolder = {
  journalSlug: string;
  userId: string;
  displayName: string;
};

/**
 * Answers "which journals may this user act in, in this role" — the scoping
 * question RBAC deliberately does not answer. `user_roles` grants a permission
 * across the whole press; `journal_memberships` narrows it to a set of
 * journals.
 *
 * Replaces `user_section_editor_disciplines`, which stored the same idea keyed
 * by an Arabic classifier label. Journals are 1:1 with those labels (see
 * `journal-catalog.ts`), so nothing is lost by keying on the journal instead —
 * and the label stops being a second, parallel taxonomy.
 *
 * `journal_manager` is one seat per journal, stored here like the editor seat.
 * A manager sees that journal's queue, not every journal on the site.
 */
@Injectable()
export class JournalMembershipService {
  constructor(
    @InjectRepository(JournalMembership)
    private readonly membershipsRepo: Repository<JournalMembership>,
    @InjectRepository(Journal)
    private readonly journalsRepo: Repository<Journal>,
  ) {}

  /** Journal ids this user holds `roleSlug` in. Empty means "no journals". */
  async listJournalIdsForUser(
    userId: string,
    roleSlug: string,
  ): Promise<string[]> {
    const rows = await this.membershipsRepo.find({
      where: { userId, roleSlug },
      select: ['journalId'],
    });
    return rows.map((r) => r.journalId);
  }

  /** Users holding `roleSlug` in this journal. */
  async listUserIdsForJournal(
    journalId: string,
    roleSlug: string,
  ): Promise<string[]> {
    const rows = await this.membershipsRepo.find({
      where: { journalId, roleSlug },
      select: ['userId'],
    });
    return rows.map((r) => r.userId);
  }

  /**
   * Restricts `userIds` to those holding `roleSlug` in `journalId`.
   *
   * Done as one indexed lookup rather than a per-user check, because the
   * section-editor suggestion path already has the candidate set in hand.
   */
  async filterUserIdsInJournal(
    userIds: string[],
    journalId: string,
    roleSlug: string,
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.membershipsRepo.find({
      where: { userId: In(userIds), journalId, roleSlug },
      select: ['userId'],
    });
    return rows.map((r) => r.userId);
  }

  /**
   * Journal slugs a user serves for `roleSlug`, keyed by user id.
   *
   * Slugs, not ids, because this is what the staff-admin API speaks: they are
   * the same stable public identifiers the portal URLs use, so an admin screen
   * and a reader's URL name a journal the same way.
   */
  async journalSlugsByUser(
    userIds: string[],
    roleSlug: string,
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (userIds.length === 0) return result;
    const rows = await this.membershipsRepo.find({
      where: { userId: In(userIds), roleSlug },
      select: ['userId', 'journalId'],
    });
    if (rows.length === 0) return result;
    const slugByJournalId = await this.slugByJournalId();
    for (const row of rows) {
      const slug = slugByJournalId.get(row.journalId);
      if (!slug) continue;
      const arr = result.get(row.userId) ?? [];
      arr.push(slug);
      result.set(row.userId, arr);
    }
    return result;
  }

  /** Journal slugs for one user, sorted for a stable API response. */
  async journalSlugsForUser(
    userId: string,
    roleSlug: string,
  ): Promise<string[]> {
    const map = await this.journalSlugsByUser([userId], roleSlug);
    return (map.get(userId) ?? []).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Who currently holds a singleton seat (`editor` or `journal_manager`) on
   * each journal. Plain fields only — the user row also carries a password hash.
   * Section editors are many per journal and are not listed here.
   */
  async listSingletonRoleHolders(
    roleSlug: string,
  ): Promise<JournalRoleHolder[]> {
    const rows = await this.membershipsRepo.find({
      where: { roleSlug },
      relations: { user: true, journal: true },
    });
    return rows
      .flatMap((row) => {
        const journalSlug = row.journal?.slug;
        const displayName = row.user?.displayName;
        if (!journalSlug || !displayName) return [];
        return [{ journalSlug, userId: row.userId, displayName }];
      })
      .sort((a, b) => a.journalSlug.localeCompare(b.journalSlug));
  }

  /**
   * Replaces this user's journals for `roleSlug`. Returns the slugs actually
   * stored, so a caller that passed an unknown slug sees it dropped rather
   * than silently accepted.
   *
   * For editor-in-chief and journal manager, a journal that already has
   * someone else in that role is refused. Clearing the seat on their card
   * is what frees it for the next person. This replaces the user's whole
   * set for the role. Staff screens use {@link setJournalSlugsWithinActor}
   * so one manager cannot wipe seats on journals they do not hold.
   */
  async setJournalSlugsForUser(
    userId: string,
    roleSlug: string,
    slugs: string[],
  ): Promise<string[]> {
    const journalIdBySlug = await this.journalIdBySlug();
    const wanted = new Map<string, string>();
    for (const slug of slugs) {
      const journalId = journalIdBySlug.get(slug);
      if (journalId) wanted.set(journalId, slug);
    }

    await this.membershipsRepo.manager.transaction(async (em) => {
      const repo = em.getRepository(JournalMembership);
      if (ONE_PER_JOURNAL_ROLES.has(roleSlug) && wanted.size > 0) {
        const existing = await repo.find({
          where: { roleSlug, journalId: In([...wanted.keys()]) },
          relations: { user: true },
        });
        const taken = existing.filter((row) => row.userId !== userId);
        if (taken.length > 0) {
          throw new ConflictException({
            message:
              'Each journal can have only one person in this role. Remove the journal from the person who already holds it, then assign it here.',
            code: 'JOURNAL_ROLE_TAKEN',
            holders: taken.map((row) => ({
              slug: wanted.get(row.journalId) ?? row.journalId,
              displayName: row.user?.displayName ?? '',
            })),
          });
        }
      }

      await repo.delete({ userId, roleSlug });
      if (wanted.size > 0) {
        try {
          await repo.save(
            [...wanted.keys()].map((journalId) =>
              repo.create({ userId, journalId, roleSlug }),
            ),
          );
        } catch (err) {
          if (!isOnePerJournalViolation(err)) throw err;
          throw new ConflictException({
            message:
              'Each journal can have only one person in this role. Remove the journal from the person who already holds it, then assign it here.',
            code: 'JOURNAL_ROLE_TAKEN',
          });
        }
      }
    });
    return [...wanted.values()].sort((a, b) => a.localeCompare(b));
  }

  /**
   * Replaces this user's journals for `roleSlug` only inside the journals
   * the actor manages. Seats on other journals stay. Slugs outside the
   * actor's journals are ignored.
   */
  async setJournalSlugsWithinActor(
    actorUserId: string,
    userId: string,
    roleSlug: string,
    slugs: string[],
  ): Promise<string[]> {
    const actorJournalIds = await this.listJournalIdsForUser(
      actorUserId,
      ROLE_SLUGS.JOURNAL_MANAGER,
    );
    if (actorJournalIds.length === 0) {
      throw new ForbiddenException({
        message: 'You are not journal manager of any journal',
        code: 'JOURNAL_OUT_OF_SCOPE',
      });
    }
    const journalIdBySlug = await this.journalIdBySlug();
    const actorIds = new Set(actorJournalIds);
    const wantedIds = new Set<string>();
    for (const slug of slugs) {
      const journalId = journalIdBySlug.get(slug);
      if (journalId && actorIds.has(journalId)) wantedIds.add(journalId);
    }

    await this.membershipsRepo.manager.transaction(async (em) => {
      const repo = em.getRepository(JournalMembership);
      if (ONE_PER_JOURNAL_ROLES.has(roleSlug) && wantedIds.size > 0) {
        const existing = await repo.find({
          where: { roleSlug, journalId: In([...wantedIds]) },
          relations: { user: true },
        });
        // The manager seat can only be written by the person who holds it.
        // Giving it to someone else is a transfer: their row is released in
        // this same transaction, so the journal is never left without a writer
        // who can still reach this method.
        const taken = existing.filter(
          (row) =>
            row.userId !== userId &&
            !(
              roleSlug === ROLE_SLUGS.JOURNAL_MANAGER &&
              row.userId === actorUserId
            ),
        );
        if (taken.length > 0) {
          const slugById = await this.slugByJournalId();
          throw new ConflictException({
            message:
              'Each journal can have only one person in this role. Remove the journal from the person who already holds it, then assign it here.',
            code: 'JOURNAL_ROLE_TAKEN',
            holders: taken.map((row) => ({
              slug: slugById.get(row.journalId) ?? row.journalId,
              displayName: row.user?.displayName ?? '',
            })),
          });
        }
        const releasing = existing.filter(
          (row) =>
            roleSlug === ROLE_SLUGS.JOURNAL_MANAGER &&
            row.userId === actorUserId &&
            row.userId !== userId &&
            wantedIds.has(row.journalId),
        );
        if (releasing.length > 0) await repo.remove(releasing);
      }

      const mine = await repo.find({ where: { userId, roleSlug } });
      const drop = mine.filter((row) => actorIds.has(row.journalId));
      if (drop.length > 0) await repo.remove(drop);
      if (wantedIds.size > 0) {
        try {
          await repo.save(
            [...wantedIds].map((journalId) =>
              repo.create({ userId, journalId, roleSlug }),
            ),
          );
        } catch (err) {
          if (!isOnePerJournalViolation(err)) throw err;
          throw new ConflictException({
            message:
              'Each journal can have only one person in this role. Remove the journal from the person who already holds it, then assign it here.',
            code: 'JOURNAL_ROLE_TAKEN',
          });
        }
      }
    });
    return this.journalSlugsForUser(userId, roleSlug);
  }

  /** Arabic classifier label for one journal, or null if the row is gone. */
  async disciplineLabelForJournal(journalId: string): Promise<string | null> {
    const journal = await this.journalsRepo.findOne({
      where: { id: journalId },
      select: ['id', 'disciplineLabel'],
    });
    return journal?.disciplineLabel ?? null;
  }

  private async slugByJournalId(): Promise<Map<string, string>> {
    const journals = await this.journalsRepo.find({ select: ['id', 'slug'] });
    return new Map(journals.map((j) => [j.id, j.slug]));
  }

  private async journalIdBySlug(): Promise<Map<string, string>> {
    const journals = await this.journalsRepo.find({ select: ['id', 'slug'] });
    return new Map(journals.map((j) => [j.slug, j.id]));
  }
}

function isOnePerJournalViolation(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driver = err.driverError as { code?: string; constraint?: string };
  return (
    driver?.code === '23505' &&
    typeof driver.constraint === 'string' &&
    ONE_PER_JOURNAL_INDEXES.has(driver.constraint)
  );
}
