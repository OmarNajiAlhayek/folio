import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Submission } from '../entities/submission.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import { User } from '../entities/user.entity';
import type { RequestUser } from '../common/types/request-user';
import { PERMISSION_SLUGS, ROLE_SLUGS } from '../rbac/permission-slugs';
import { RbacService } from '../rbac/rbac.service';
import { JournalMembershipService } from '../journals/journal-membership.service';
import { SubmissionAccessService } from './submission-access.service';
import {
  ACTIVE_REVIEW_STATUSES,
  reviewerAvailabilityView,
  reviewerBlockReason,
  reviewerConflictOfInterest,
  utcToday,
  type ReviewerAvailabilityView,
  type ReviewerBlockReason,
} from './reviewer-availability';

export type ReviewerStatsSummary = {
  invitations: number;
  /** Took the work on: `accepted` or `completed`. */
  accepted: number;
  declined: number;
  completed: number;
  /** accepted / (accepted + declined); null until they have answered one. */
  acceptanceRate: number | null;
  avgDaysToRespond: number | null;
  avgDaysToComplete: number | null;
  /** Completed reviews that met their due date, among those that had one. */
  onTimeRate: number | null;
  lastCompletedAt: string | null;
};

export type ReviewerDirectoryEntry = {
  id: string;
  displayName: string;
  email: string;
  affiliation: string | null;
  orcid: string | null;
  reviewKeywords: string | null;
  availability: ReviewerAvailabilityView;
  /** `max` null is no limit. */
  capacity: { active: number; max: number | null };
  stats: ReviewerStatsSummary;
  /** Latest assignment status on *this* manuscript, if any. */
  thisSubmissionStatus: string | null;
  conflictOfInterest: boolean;
  blockReason: ReviewerBlockReason | null;
};

export type ReviewerRecentAssignment = {
  assignmentId: string;
  status: string;
  assignedAt: string;
  respondedAt: string | null;
  reviewDueAt: string | null;
  submittedAt: string | null;
  recommendation: string | null;
  journal: { slug: string; titleEn: string; titleAr: string } | null;
  /** Null when the manuscript is in a journal the caller does not edit. */
  submission: { slug: string | null; title: string } | null;
};

export type ReviewerDetail = ReviewerDirectoryEntry & {
  recommendations: Record<string, number>;
  recent: ReviewerRecentAssignment[];
};

/** One row of the per-reviewer aggregate over `review_assignments`. */
export type ReviewerAggregateRow = {
  reviewerId: string;
  invitations: number;
  accepted: number;
  declined: number;
  completed: number;
  active: number;
  avgDaysToRespond: number | null;
  avgDaysToComplete: number | null;
  dueTracked: number;
  onTime: number;
  lastCompletedAt: Date | string | null;
};

type RecentAssignmentRow = {
  assignmentId: string;
  status: string;
  assignedAt: Date;
  respondedAt: Date | null;
  reviewDueAt: Date | null;
  submittedAt: Date | null;
  recommendation: string | null;
  submissionId: string;
  submissionSlug: string | null;
  submissionTitle: string;
  journalId: string | null;
  journalSlug: string | null;
  journalTitleEn: string | null;
  journalTitleAr: string | null;
};

const RECENT_LIMIT = 10;

const EMPTY_AGGREGATE: Omit<ReviewerAggregateRow, 'reviewerId'> = {
  invitations: 0,
  accepted: 0,
  declined: 0,
  completed: 0,
  active: 0,
  avgDaysToRespond: null,
  avgDaysToComplete: null,
  dueTracked: 0,
  onTime: 0,
  lastCompletedAt: null,
};

function roundDays(n: number | null): number | null {
  return n == null ? null : Math.round(Number(n) * 10) / 10;
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export function toReviewerStatsSummary(
  row: Omit<ReviewerAggregateRow, 'reviewerId'>,
): ReviewerStatsSummary {
  return {
    invitations: row.invitations,
    accepted: row.accepted,
    declined: row.declined,
    completed: row.completed,
    acceptanceRate: ratio(row.accepted, row.accepted + row.declined),
    avgDaysToRespond: roundDays(row.avgDaysToRespond),
    avgDaysToComplete: roundDays(row.avgDaysToComplete),
    onTimeRate: ratio(row.onTime, row.dueTracked),
    lastCompletedAt: iso(row.lastCompletedAt),
  };
}

/**
 * Everything an editor needs to choose a reviewer: who is in the pool, how
 * busy and how reliable each one is, and whether this manuscript can go to
 * them at all.
 *
 * Aggregates come from one grouped query over the whole pool. The role-admin
 * list learned the hard way (see `UsersService.listForRoleAdmin`) what a
 * per-user lookup costs once the page has more than a handful of rows.
 */
@Injectable()
export class ReviewerDirectoryService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(ReviewAssignment)
    private readonly assignmentsRepo: Repository<ReviewAssignment>,
    private readonly rbacService: RbacService,
    private readonly journalMemberships: JournalMembershipService,
    private readonly access: SubmissionAccessService,
  ) {}

  async listForSubmission(
    slug: string,
    user: RequestUser,
  ): Promise<ReviewerDirectoryEntry[]> {
    const submission = await this.readableSubmission(slug, user);
    const reviewers = await this.loadReviewerPool();
    if (reviewers.length === 0) return [];
    return this.buildEntries(submission, reviewers);
  }

  async getReviewerDetail(
    slug: string,
    reviewerId: string,
    user: RequestUser,
  ): Promise<ReviewerDetail> {
    const submission = await this.readableSubmission(slug, user);
    // Not restricted to the willing pool: the sidebar opens this for reviewers
    // already assigned, who may have opted out since.
    const reviewer = await this.usersRepo.findOne({
      where: { id: reviewerId },
    });
    if (
      !reviewer ||
      !(await this.rbacService.userHasPermission(
        reviewerId,
        PERMISSION_SLUGS.REVIEW_SUBMIT,
      ))
    ) {
      throw new NotFoundException({
        message: 'Reviewer not found',
        code: 'NOT_FOUND',
      });
    }
    const [[entry], recommendations, recent] = await Promise.all([
      this.buildEntries(submission, [reviewer]),
      this.loadRecommendations(reviewerId),
      this.loadRecent(reviewerId, submission, user),
    ]);
    return { ...entry, recommendations, recent };
  }

  private async readableSubmission(
    slug: string,
    user: RequestUser,
  ): Promise<Submission> {
    const submission = await this.access.getBySlugOrThrow(slug);
    await this.access.assertCanRead(submission, user);
    return submission;
  }

  /** The same pool `GET /users/reviewer-candidates` has always offered. */
  private async loadReviewerPool(): Promise<User[]> {
    const ids = await this.rbacService.listUserIdsWithPermission(
      PERMISSION_SLUGS.REVIEW_SUBMIT,
    );
    if (ids.length === 0) return [];
    return this.usersRepo.find({
      where: { id: In(ids), willingToReview: true },
      order: { displayName: 'ASC', email: 'ASC' },
    });
  }

  private async buildEntries(
    submission: Submission,
    reviewers: User[],
  ): Promise<ReviewerDirectoryEntry[]> {
    const ids = reviewers.map((r) => r.id);
    const [aggregates, onThisSubmission] = await Promise.all([
      this.loadAggregates(ids),
      this.loadStatusOnSubmission(submission.id, ids),
    ]);
    const today = utcToday();
    return reviewers.map((r) => {
      const agg = aggregates.get(r.id) ?? EMPTY_AGGREGATE;
      const availability = reviewerAvailabilityView(r, today);
      const thisStatus = onThisSubmission.get(r.id) ?? null;
      const conflictOfInterest =
        reviewerConflictOfInterest(submission, r) !== null;
      return {
        id: r.id,
        displayName: r.displayName,
        email: r.email,
        affiliation: r.affiliation,
        orcid: r.orcid,
        reviewKeywords: r.reviewKeywords,
        availability,
        capacity: { active: agg.active, max: r.reviewerMaxActiveReviews },
        stats: toReviewerStatsSummary(agg),
        thisSubmissionStatus: thisStatus,
        conflictOfInterest,
        blockReason: reviewerBlockReason({
          conflictOfInterest,
          alreadyAssigned: (
            ACTIVE_REVIEW_STATUSES as readonly string[]
          ).includes(thisStatus ?? ''),
          available: availability.available,
          activeLoad: agg.active,
          maxActive: r.reviewerMaxActiveReviews,
        }),
      };
    });
  }

  async loadAggregates(
    reviewerIds: string[],
  ): Promise<Map<string, ReviewerAggregateRow>> {
    if (reviewerIds.length === 0) return new Map();
    // Day arithmetic in SQL: EXTRACT(EPOCH …) / 86400 keeps fractional days,
    // so a review returned in 36 hours averages as 1.5, not 1. Each duration
    // is floored at zero: rows written before the timestamptz migrations can
    // carry a submission a few hours "before" its invitation, and one such
    // row would otherwise drag the average negative.
    const rows: ReviewerAggregateRow[] = await this.assignmentsRepo.query(
      `SELECT a.reviewer_id AS "reviewerId",
              COUNT(*)::int AS "invitations",
              COUNT(*) FILTER (WHERE a.status IN ('accepted', 'completed'))::int AS "accepted",
              COUNT(*) FILTER (WHERE a.status = 'declined')::int AS "declined",
              COUNT(*) FILTER (WHERE a.status = 'completed')::int AS "completed",
              COUNT(*) FILTER (WHERE a.status IN ('invited', 'accepted'))::int AS "active",
              (AVG(GREATEST(0, EXTRACT(EPOCH FROM (a.responded_at - a.assigned_at))) / 86400)
                 FILTER (WHERE a.responded_at IS NOT NULL))::float8 AS "avgDaysToRespond",
              (AVG(GREATEST(0, EXTRACT(EPOCH FROM (r.submitted_at - COALESCE(a.responded_at, a.assigned_at)))) / 86400)
                 FILTER (WHERE a.status = 'completed' AND r.submitted_at IS NOT NULL))::float8 AS "avgDaysToComplete",
              COUNT(*) FILTER (WHERE a.status = 'completed' AND r.submitted_at IS NOT NULL
                                 AND a.review_due_at IS NOT NULL)::int AS "dueTracked",
              COUNT(*) FILTER (WHERE a.status = 'completed' AND r.submitted_at IS NOT NULL
                                 AND r.submitted_at <= a.review_due_at)::int AS "onTime",
              MAX(r.submitted_at) AS "lastCompletedAt"
         FROM review_assignments a
         LEFT JOIN reviews r ON r.assignment_id = a.id
        WHERE a.reviewer_id = ANY($1::uuid[])
        GROUP BY a.reviewer_id`,
      [reviewerIds],
    );
    return new Map(rows.map((row) => [row.reviewerId, row]));
  }

  /** Newest assignment per reviewer on this manuscript. */
  private async loadStatusOnSubmission(
    submissionId: string,
    reviewerIds: string[],
  ): Promise<Map<string, string>> {
    if (reviewerIds.length === 0) return new Map();
    const rows = await this.assignmentsRepo.find({
      where: { submissionId, reviewerId: In(reviewerIds) },
      select: ['reviewerId', 'status', 'assignedAt'],
      order: { assignedAt: 'ASC' },
    });
    // Ascending, so the latest write per reviewer wins.
    return new Map(rows.map((a) => [a.reviewerId, a.status]));
  }

  private async loadRecommendations(
    reviewerId: string,
  ): Promise<Record<string, number>> {
    const rows: Array<{ recommendation: string; n: number }> =
      await this.assignmentsRepo.query(
        `SELECT r.recommendation AS "recommendation", COUNT(*)::int AS "n"
           FROM reviews r
           JOIN review_assignments a ON a.id = r.assignment_id
          WHERE a.reviewer_id = $1
          GROUP BY r.recommendation`,
        [reviewerId],
      );
    return Object.fromEntries(rows.map((r) => [r.recommendation, r.n]));
  }

  /**
   * Titles of unpublished manuscripts are editorial information of the
   * journal they were sent to. An editor of one journal sees titles from the
   * journals they edit (and from the manuscript in front of them); anything
   * else shows only as "a manuscript in {journal}".
   */
  private async loadRecent(
    reviewerId: string,
    current: Submission,
    user: RequestUser,
  ): Promise<ReviewerRecentAssignment[]> {
    const [editorJournals, sectionJournals, rows] = await Promise.all([
      this.journalMemberships.listJournalIdsForUser(
        user.sub,
        ROLE_SLUGS.EDITOR,
      ),
      this.journalMemberships.listJournalIdsForUser(
        user.sub,
        ROLE_SLUGS.SECTION_EDITOR,
      ),
      this.queryRecent(reviewerId),
    ]);
    const visibleJournals = new Set([
      ...editorJournals,
      ...sectionJournals,
      current.journalId,
    ]);
    return rows.map((row) => ({
      assignmentId: row.assignmentId,
      status: row.status,
      assignedAt: iso(row.assignedAt) ?? '',
      respondedAt: iso(row.respondedAt),
      reviewDueAt: iso(row.reviewDueAt),
      submittedAt: iso(row.submittedAt),
      recommendation: row.recommendation,
      journal: row.journalSlug
        ? {
            slug: row.journalSlug,
            titleEn: row.journalTitleEn ?? '',
            titleAr: row.journalTitleAr ?? '',
          }
        : null,
      submission:
        row.submissionId === current.id ||
        (row.journalId != null && visibleJournals.has(row.journalId))
          ? { slug: row.submissionSlug, title: row.submissionTitle }
          : null,
    }));
  }

  private async queryRecent(
    reviewerId: string,
  ): Promise<RecentAssignmentRow[]> {
    const rows: RecentAssignmentRow[] = await this.assignmentsRepo.query(
      `SELECT a.id AS "assignmentId",
              a.status AS "status",
              a.assigned_at AS "assignedAt",
              a.responded_at AS "respondedAt",
              a.review_due_at AS "reviewDueAt",
              r.submitted_at AS "submittedAt",
              r.recommendation AS "recommendation",
              s.id AS "submissionId",
              s.slug AS "submissionSlug",
              s.title AS "submissionTitle",
              j.id AS "journalId",
              j.slug AS "journalSlug",
              j.title_en AS "journalTitleEn",
              j.title_ar AS "journalTitleAr"
         FROM review_assignments a
         JOIN submissions s ON s.id = a.submission_id
         LEFT JOIN journals j ON j.id = s.journal_id
         LEFT JOIN reviews r ON r.assignment_id = a.id
        WHERE a.reviewer_id = $1
        ORDER BY a.assigned_at DESC
        LIMIT ${RECENT_LIMIT}`,
      [reviewerId],
    );
    return rows;
  }
}
