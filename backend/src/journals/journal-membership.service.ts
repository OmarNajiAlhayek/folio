import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Journal } from '../entities/journal.entity';
import { JournalMembership } from '../entities/journal-membership.entity';

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
 * The university-wide `journal_manager` role is intentionally never scoped
 * here; callers treat it as "every journal".
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
   * Replaces this user's journals for `roleSlug`. Returns the slugs actually
   * stored, so a caller that passed an unknown slug sees it dropped rather
   * than silently accepted.
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

    await this.membershipsRepo.delete({ userId, roleSlug });
    if (wanted.size > 0) {
      await this.membershipsRepo.save(
        [...wanted.keys()].map((journalId) =>
          this.membershipsRepo.create({ userId, journalId, roleSlug }),
        ),
      );
    }
    return [...wanted.values()].sort((a, b) => a.localeCompare(b));
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
