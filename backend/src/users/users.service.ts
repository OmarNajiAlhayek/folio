import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  EntityManager,
  In,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { User } from '../entities/user.entity';
import { JournalMembershipService } from '../journals/journal-membership.service';
import { StaffReleaseService } from '../journals/staff-release.service';
import {
  OAuthIdentity,
  OAUTH_PROVIDER_ORCID,
} from '../entities/oauth-identity.entity';
import {
  RoleInvitation,
  RoleInvitationStatus,
} from '../entities/role-invitation.entity';
import { PERMISSION_SLUGS, ROLE_SLUGS } from '../rbac/permission-slugs';
import { RbacService } from '../rbac/rbac.service';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPE } from '../notifications/notification-types';
import {
  roleInvitationCreatedKey,
  roleRemovedNotifKey,
} from '../notifications/notification-idempotency';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { generateEntityId } from '@folio/shared';
import { ROUTING_KEY } from '@folio/shared/contracts/email-events';
import type {
  RoleInvitationCreatedEvent,
  RoleRemovedEvent,
} from '@folio/shared/contracts/email-events';
import {
  roleInvitationEmailKey,
  roleRemovedEmailKey,
} from '@folio/shared/messaging/idempotency';
import { resolveEmailLocale } from '../common/email-locale';
import {
  reviewerAvailabilityView,
  utcToday,
  type ReviewerAvailabilityView,
} from '../submissions/reviewer-availability';

/** A role invitation not answered within this many days stops being valid. */
export const ROLE_INVITATION_TTL_DAYS = 30;

function invitationCutoff(): Date {
  return new Date(Date.now() - ROLE_INVITATION_TTL_DAYS * 86_400_000);
}

/** Roles a manager may switch on directly; every other role needs an invitation. */
const DIRECT_ROLES: ReadonlySet<string> = new Set([
  ROLE_SLUGS.AUTHOR,
  ROLE_SLUGS.REVIEWER,
  ROLE_SLUGS.COPYEDITOR,
]);

/** Seats that make someone an assignee of a journal's papers. */
const EDITORIAL_SEAT_ROLES: readonly string[] = [
  ROLE_SLUGS.EDITOR,
  ROLE_SLUGS.JOURNAL_MANAGER,
  ROLE_SLUGS.SECTION_EDITOR,
];

/** Roles whose reach is narrowed by `journal_memberships`. */
const JOURNAL_SCOPED_ROLES: readonly string[] = [
  ROLE_SLUGS.EDITOR,
  ROLE_SLUGS.JOURNAL_MANAGER,
  ROLE_SLUGS.SECTION_EDITOR,
  ROLE_SLUGS.REVIEWER,
];

/**
 * UTC instant at which calendar day `ymd` starts for a viewer whose
 * `Date.getTimezoneOffset()` is `tzOffsetMinutes`.
 */
function localDayStartUtc(ymd: string, tzOffsetMinutes: number): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + tzOffsetMinutes * 60_000);
}

export type ReviewerCandidate = {
  id: string;
  displayName: string;
  email: string;
};

export type CopyeditorCandidate = {
  id: string;
  displayName: string;
  email: string;
};

export type PublicUserProfile = {
  id: string;
  email: string;
  displayName: string;
  affiliation: string | null;
  orcid: string | null;
  reviewKeywords: string | null;
  willingToReview: boolean;
  /**
   * Effective status (an "until" date in the past reads as available) plus
   * the reviewer's concurrent limit; `maxActiveReviews` null is no limit.
   */
  reviewerAvailability: ReviewerAvailabilityView & {
    maxActiveReviews: number | null;
  };
  /** `en` | `ar` when set — controls outbound email language resolution. */
  preferredLocale: string | null;
  emailVerified: boolean;
  /** False for ORCID-only accounts until a password is set. */
  hasPassword: boolean;
  orcidLinked: boolean;
  profileComplete: boolean;
  roles: string[];
  permissions: string[];
};

export type PendingRoleInvitationView = {
  id: string;
  roleSlug: string;
  createdAt: string;
  invitedBy: { displayName: string; email: string };
};

export type AdminUserPendingInvitation = {
  id: string;
  roleSlug: string;
};

export type AdminUserRow = {
  id: string;
  email: string;
  displayName: string;
  affiliation: string | null;
  willingToReview: boolean;
  roleSlugs: string[];
  pendingRoleInvitations: AdminUserPendingInvitation[];
};

export type AdminUserListResult = {
  items: AdminUserRow[];
  total: number;
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(OAuthIdentity)
    private readonly oauthRepo: Repository<OAuthIdentity>,
    @InjectRepository(RoleInvitation)
    private readonly roleInvRepo: Repository<RoleInvitation>,
    private readonly journalMemberships: JournalMembershipService,
    private readonly staffRelease: StaffReleaseService,
    private readonly rbacService: RbacService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly notifications: NotificationsService,
    private readonly eventPublisher: EventPublisherService,
    private readonly config: ConfigService,
  ) {}

  private appBaseUrl(): string {
    return (
      this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:5240'
    ).replace(/\/+$/, '');
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email: email.toLowerCase() } });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  async findByOrcid(orcid: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { orcid } });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    displayName: string;
    affiliation?: string | null;
    orcid?: string | null;
    reviewKeywords?: string | null;
    willingToReview?: boolean;
  }): Promise<User> {
    const user = this.usersRepo.create({
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      displayName: data.displayName,
      affiliation: data.affiliation ?? null,
      orcid: data.orcid ?? null,
      reviewKeywords: data.reviewKeywords ?? null,
      willingToReview: data.willingToReview ?? false,
    });
    const saved = await this.usersRepo.save(user);
    await this.rbacService.addAuthorRoleIfNone(saved.id);
    return saved;
  }

  async createOAuthUser(data: {
    email: string;
    displayName: string;
    affiliation?: string | null;
    orcid: string;
    emailVerified: boolean;
  }): Promise<User> {
    const user = this.usersRepo.create({
      email: data.email.toLowerCase(),
      passwordHash: null,
      displayName: data.displayName,
      affiliation: data.affiliation ?? null,
      orcid: data.orcid,
      reviewKeywords: null,
      willingToReview: false,
      emailVerifiedAt: data.emailVerified ? new Date() : null,
    });
    const saved = await this.usersRepo.save(user);
    await this.rbacService.addAuthorRoleIfNone(saved.id);
    return saved;
  }

  /**
   * Incomplete until the account has a real display name (ORCID sign-up starts
   * from an `ORCID 0000-…` placeholder) **and** an ORCID iD. ORCID is the
   * primary identifier of every participant (Damascus University,
   * 2026-09-14): registration requires it, and this catches accounts created
   * before the rule, which the frontend holds at `/complete-profile`.
   */
  needsProfileCompletionForUser(user: User): boolean {
    return (
      !user.orcid ||
      /^ORCID \d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(user.displayName)
    );
  }

  async needsProfileCompletion(userId: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) return false;
    return this.needsProfileCompletionForUser(user);
  }

  /**
   * Merge researcher-profile fields (e.g. seed idempotency).
   */
  async patchResearcherProfile(
    userId: string,
    data: {
      affiliation?: string | null;
      orcid?: string | null;
      reviewKeywords?: string | null;
      willingToReview?: boolean;
      preferredLocale?: string | null;
    },
  ): Promise<void> {
    const patch: Partial<User> = {};
    if (data.affiliation !== undefined) patch.affiliation = data.affiliation;
    if (data.orcid !== undefined) patch.orcid = data.orcid;
    if (data.reviewKeywords !== undefined)
      patch.reviewKeywords = data.reviewKeywords;
    if (data.willingToReview !== undefined)
      patch.willingToReview = data.willingToReview;
    if (data.preferredLocale !== undefined)
      patch.preferredLocale = data.preferredLocale;
    if (Object.keys(patch).length === 0) return;
    await this.usersRepo.update({ id: userId }, patch);
  }

  async patchMe(
    userId: string,
    preferredLocale: 'en' | 'ar' | null | undefined,
  ): Promise<PublicUserProfile> {
    if (preferredLocale !== undefined) {
      await this.usersRepo.update({ id: userId }, { preferredLocale });
    }
    const profile = await this.toPublicProfile(userId);
    if (!profile) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }
    return profile;
  }

  /** Escape `%` and `_` for safe ILIKE patterns. */
  private escapeIlikePattern(raw: string): string {
    return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  async listForRoleAdmin(query: {
    q?: string;
    role?: string;
    joinedFrom?: string;
    joinedTo?: string;
    /** Viewer's `Date.getTimezoneOffset()`, so day filters follow their calendar. */
    tzOffset?: number;
    limit: number;
    offset: number;
  }): Promise<AdminUserListResult> {
    const tz = query.tzOffset ?? 0;
    const qb = this.usersRepo
      .createQueryBuilder('u')
      .select([
        'u.id',
        'u.email',
        'u.displayName',
        'u.affiliation',
        'u.willingToReview',
      ])
      .orderBy('u.display_name', 'ASC')
      .addOrderBy('u.email', 'ASC')
      .skip(query.offset)
      .take(query.limit);

    if (query.q) {
      // The folded branch is what makes `احمد` find `أحمد` and `هندسه` find
      // `هندسة`. Postgres folds both sides with the same function — folding the
      // query in TypeScript instead would be a second implementation that has to
      // agree on every input. The gin_trgm_ops index on search_normalized serves
      // the ILIKE.
      //
      // Two details this depends on:
      //  - the wildcards are concatenated *after* folding, because the fold
      //    strips non-alphanumerics and would eat a `%` wrapped around it;
      //  - that same stripping removes `%` and `_` from the query, so no ILIKE
      //    metacharacter can survive into the pattern;
      //  - a query that folds away to nothing (`@`, `...`) is skipped, or the
      //    pattern would collapse to '%%' and match every user.
      //
      // The raw branches are kept so this is strictly a superset of the old
      // behaviour: substrings the fold discards, like part of an email address,
      // still match the way they always did.
      const pattern = `%${this.escapeIlikePattern(query.q)}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where(
              `(folio_normalize_search(:q) <> ''
                AND u.search_normalized ILIKE '%' || folio_normalize_search(:q) || '%')`,
              { q: query.q },
            )
            .orWhere('u.email ILIKE :pattern', { pattern })
            .orWhere('u.display_name ILIKE :pattern', { pattern });
        }),
      );
    }

    if (query.role) {
      qb.andWhere(
        `u.id IN (
          SELECT ur.user_id FROM user_roles ur
          INNER JOIN roles r ON r.id = ur.role_id
          WHERE r.slug = :roleSlug
        )`,
        { roleSlug: query.role },
      );
    }

    if (query.joinedFrom) {
      qb.andWhere('u.created_at >= :joinedFrom', {
        joinedFrom: localDayStartUtc(query.joinedFrom, tz),
      });
    }

    if (query.joinedTo) {
      const endOfDay = new Date(
        localDayStartUtc(query.joinedTo, tz).getTime() + 86_400_000 - 1,
      );
      qb.andWhere('u.created_at <= :joinedTo', { joinedTo: endOfDay });
    }

    const [users, total] = await qb.getManyAndCount();
    if (users.length === 0) {
      return { items: [], total };
    }

    const userIds = users.map((u) => u.id);
    const privilegedSlugs = [
      ROLE_SLUGS.EDITOR,
      ROLE_SLUGS.JOURNAL_MANAGER,
      ROLE_SLUGS.SECTION_EDITOR,
    ];
    const pendingInvites = await this.roleInvRepo.find({
      where: {
        inviteeUserId: In(userIds),
        status: RoleInvitationStatus.INVITED,
        roleSlug: In(privilegedSlugs),
        createdAt: MoreThanOrEqual(invitationCutoff()),
      },
      select: ['id', 'inviteeUserId', 'roleSlug'],
    });
    const invitesByUser = new Map<string, AdminUserPendingInvitation[]>();
    for (const inv of pendingInvites) {
      const list = invitesByUser.get(inv.inviteeUserId) ?? [];
      list.push({ id: inv.id, roleSlug: inv.roleSlug });
      invitesByUser.set(inv.inviteeUserId, list);
    }

    // One query for the whole page. This used to be a `Promise.all` of
    // per-user lookups — twenty rows meant twenty queries, each joining three
    // levels of relations.
    const rolesByUser = await this.rbacService.getEffectiveForUsers(userIds);
    const roleResults = userIds.map(
      (id) => rolesByUser.get(id) ?? { roleSlugs: [], permissionSlugs: [] },
    );

    const items: AdminUserRow[] = users.map((u, i) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      affiliation: u.affiliation,
      willingToReview: u.willingToReview,
      roleSlugs: roleResults[i]?.roleSlugs ?? [],
      pendingRoleInvitations: invitesByUser.get(u.id) ?? [],
    }));

    return { items, total };
  }

  async listReviewerCandidates(): Promise<ReviewerCandidate[]> {
    const ids = await this.rbacService.listUserIdsWithPermission(
      PERMISSION_SLUGS.REVIEW_SUBMIT,
    );
    if (ids.length === 0) {
      return [];
    }
    const users = await this.usersRepo.find({
      where: { id: In(ids), willingToReview: true },
      select: ['id', 'displayName', 'email'],
      order: { displayName: 'ASC', email: 'ASC' },
    });
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
    }));
  }

  async listCopyeditorCandidates(): Promise<CopyeditorCandidate[]> {
    const ids = await this.rbacService.listUserIdsWithPermission(
      PERMISSION_SLUGS.COPYEDIT_SUBMIT_NOTE,
    );
    if (ids.length === 0) {
      return [];
    }
    const users = await this.usersRepo.find({
      where: { id: In(ids) },
      select: ['id', 'displayName', 'email'],
      order: { displayName: 'ASC', email: 'ASC' },
    });
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
    }));
  }

  async toPublicProfile(userId: string): Promise<PublicUserProfile | null> {
    const user = await this.findById(userId);
    if (!user) return null;
    const { roleSlugs, permissionSlugs } =
      await this.rbacService.getEffectiveForUser(userId);
    const orcidLinked = await this.oauthRepo.exists({
      where: { userId, provider: OAUTH_PROVIDER_ORCID },
    });
    const profileComplete = !this.needsProfileCompletionForUser(user);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      affiliation: user.affiliation,
      orcid: user.orcid,
      reviewKeywords: user.reviewKeywords,
      willingToReview: user.willingToReview,
      reviewerAvailability: {
        ...reviewerAvailabilityView(user, utcToday()),
        maxActiveReviews: user.reviewerMaxActiveReviews,
      },
      preferredLocale: user.preferredLocale,
      emailVerified: user.emailVerifiedAt != null,
      hasPassword: user.passwordHash != null,
      orcidLinked,
      profileComplete,
      roles: roleSlugs,
      permissions: permissionSlugs,
    };
  }

  async patchMyResearcherProfile(
    userId: string,
    data: {
      displayName?: string;
      affiliation?: string | null;
      orcid?: string | null;
      reviewKeywords?: string | null;
      willingToReview?: boolean;
      reviewerAvailable?: boolean;
      reviewerUnavailableUntil?: string | null;
      reviewerUnavailableNote?: string | null;
      reviewerMaxActiveReviews?: number | null;
    },
  ): Promise<PublicUserProfile> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }
    const patch: Partial<User> = {};
    if (data.displayName !== undefined) {
      const name = data.displayName.trim();
      if (name.length < 1) {
        throw new BadRequestException({
          message: 'Display name is required',
          code: 'VALIDATION_ERROR',
        });
      }
      patch.displayName = name;
    }
    if (data.affiliation !== undefined) patch.affiliation = data.affiliation;
    // Set or corrected, never cleared: every account keeps an ORCID iD.
    if (typeof data.orcid === 'string' && data.orcid !== user.orcid) {
      const verified = await this.oauthRepo.exists({
        where: { userId, provider: OAUTH_PROVIDER_ORCID },
      });
      if (verified) {
        throw new ConflictException({
          message:
            'Your ORCID iD is verified through ORCID sign-in. Unlink ORCID sign-in before entering a different iD.',
          code: 'ORCID_VERIFIED',
        });
      }
      const holder = await this.findByOrcid(data.orcid);
      if (holder && holder.id !== userId) {
        throw new ConflictException({
          message: 'This ORCID iD is already linked to another account',
          code: 'ORCID_ALREADY_LINKED',
        });
      }
      patch.orcid = data.orcid;
    }
    if (data.reviewKeywords !== undefined)
      patch.reviewKeywords = data.reviewKeywords;
    if (data.willingToReview !== undefined)
      patch.willingToReview = data.willingToReview;
    Object.assign(patch, this.reviewerAvailabilityPatch(data));
    if (Object.keys(patch).length > 0) {
      await this.usersRepo.update({ id: userId }, patch);
    }
    const profile = await this.toPublicProfile(userId);
    if (!profile) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }
    return profile;
  }

  /**
   * Going available clears the absence details, so a stale "until" date or
   * note never resurfaces the next time the reviewer steps away.
   */
  private reviewerAvailabilityPatch(data: {
    reviewerAvailable?: boolean;
    reviewerUnavailableUntil?: string | null;
    reviewerUnavailableNote?: string | null;
    reviewerMaxActiveReviews?: number | null;
  }): Partial<User> {
    const patch: Partial<User> = {};
    if (data.reviewerMaxActiveReviews !== undefined) {
      patch.reviewerMaxActiveReviews = data.reviewerMaxActiveReviews;
    }
    if (data.reviewerAvailable === true) {
      patch.reviewerAvailable = true;
      patch.reviewerUnavailableUntil = null;
      patch.reviewerUnavailableNote = null;
      return patch;
    }
    if (data.reviewerAvailable === false) {
      patch.reviewerAvailable = false;
    }
    if (data.reviewerUnavailableUntil !== undefined) {
      const until = data.reviewerUnavailableUntil;
      if (until !== null && until <= utcToday()) {
        throw new BadRequestException({
          message: 'The return date must be after today',
          code: 'VALIDATION_ERROR',
        });
      }
      patch.reviewerUnavailableUntil = until;
    }
    if (data.reviewerUnavailableNote !== undefined) {
      patch.reviewerUnavailableNote =
        data.reviewerUnavailableNote?.trim() || null;
    }
    return patch;
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.usersRepo.update(
      { id: userId },
      { emailVerifiedAt: new Date() },
    );
  }

  async clearEmailVerified(userId: string): Promise<void> {
    await this.usersRepo.update({ id: userId }, { emailVerifiedAt: null });
  }

  async updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.usersRepo.update({ id: userId }, { passwordHash });
  }

  isEmailVerified(user: User): boolean {
    return user.emailVerifiedAt != null;
  }

  /**
   * @param actorUserId the caller, when this is reached over HTTP. Roles the
   * caller does not already hold cannot be self-assigned — editor and
   * journal_manager already require an invitation, but without this a journal
   * manager could grant themselves `copyeditor` and then publish, or
   * `section_editor` and enter the section queue. Omitted by seed and tests,
   * which have no acting user.
   */
  async setRolesForUser(
    targetUserId: string,
    roleSlugs: string[],
    actorUserId?: string,
  ): Promise<PublicUserProfile> {
    const target = await this.findById(targetUserId);
    if (!target) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }
    const unique = [...new Set(roleSlugs)];
    const before = await this.rbacService.getEffectiveForUser(targetUserId);

    if (actorUserId && actorUserId === targetUserId) {
      const added = unique.filter((slug) => !before.roleSlugs.includes(slug));
      if (added.length > 0) {
        throw new BadRequestException({
          message:
            'You cannot grant yourself additional roles. Ask another journal manager to invite you.',
          code: 'SELF_ROLE_ELEVATION',
        });
      }
    }
    const added = unique.filter((slug) => !before.roleSlugs.includes(slug));
    const removedScoped = before.roleSlugs.filter(
      (slug) => !unique.includes(slug) && JOURNAL_SCOPED_ROLES.includes(slug),
    );
    const hadEditor = before.roleSlugs.includes(ROLE_SLUGS.EDITOR);
    const willHaveEditor = unique.includes(ROLE_SLUGS.EDITOR);
    if (!hadEditor && willHaveEditor) {
      throw new BadRequestException({
        message:
          'Adding the editor role requires an invitation. Use POST /users/:id/role-invitations with {"roleSlug":"editor"}; the user accepts in the app.',
        code: 'VALIDATION_ERROR',
      });
    }
    if (hadEditor && !willHaveEditor) {
      const n = await this.rbacService.countUsersWithRoleSlug(
        ROLE_SLUGS.EDITOR,
      );
      if (n <= 1) {
        throw new BadRequestException({
          message: 'Cannot remove the last editor',
          code: 'VALIDATION_ERROR',
        });
      }
    }

    const hadJournalManager = before.roleSlugs.includes(
      ROLE_SLUGS.JOURNAL_MANAGER,
    );
    const willHaveJournalManager = unique.includes(ROLE_SLUGS.JOURNAL_MANAGER);
    if (!hadJournalManager && willHaveJournalManager) {
      throw new BadRequestException({
        message:
          'Adding the journal_manager role requires an invitation. Use POST /users/:id/role-invitations with {"roleSlug":"journal_manager"}; the user accepts in the app.',
        code: 'VALIDATION_ERROR',
      });
    }
    if (hadJournalManager && !willHaveJournalManager) {
      const n = await this.rbacService.countUsersWithRoleSlug(
        ROLE_SLUGS.JOURNAL_MANAGER,
      );
      if (n <= 1) {
        throw new BadRequestException({
          message: 'Cannot remove the last journal manager',
          code: 'VALIDATION_ERROR',
        });
      }
    }
    // Anything else that is not a plain direct role (today: section_editor)
    // is invitation-only too, so it cannot be granted without the user's say.
    const needsInvite = added.find((slug) => !DIRECT_ROLES.has(slug));
    if (needsInvite) {
      throw new BadRequestException({
        message: `Adding the ${needsInvite} role requires an invitation. Use POST /users/:id/role-invitations with {"roleSlug":"${needsInvite}"}; the user accepts in the app.`,
        code: 'VALIDATION_ERROR',
      });
    }
    if (actorUserId && removedScoped.length > 0) {
      await this.assertRemovalWithinActorJournals(
        actorUserId,
        targetUserId,
        removedScoped,
      );
    }

    const { before: rolesBefore, after: rolesAfter } =
      await this.rbacService.assignRoles(targetUserId, unique);
    // A role that is gone takes its journal scope with it; otherwise the old
    // scope would reappear if the role were granted again.
    await this.journalMemberships.removeRoleMemberships(
      targetUserId,
      removedScoped,
    );
    // They no longer serve these journals: stop routing and mailing their
    // papers to them, and hand any paper left without an assignee onward.
    const lostEditorialSeat = removedScoped.some((slug) =>
      EDITORIAL_SEAT_ROLES.includes(slug),
    );
    if (lostEditorialSeat) {
      await this.staffRelease.releaseUserFromAllJournals(
        targetUserId,
        actorUserId ?? targetUserId,
      );
    }
    // Sessions carry the old role claims, so they only need to go when the
    // role set actually changed.
    const changed =
      [...rolesBefore.roleSlugs].sort().join('|') !==
      [...rolesAfter.roleSlugs].sort().join('|');
    if (changed) {
      await this.authService.revokeAllSessionsForUser(targetUserId);
    }
    // Tell the person why they were signed out. Only when someone else did it;
    // giving up your own role needs no message.
    const removed = rolesBefore.roleSlugs.filter(
      (slug) => !rolesAfter.roleSlugs.includes(slug),
    );
    if (actorUserId && actorUserId !== targetUserId && removed.length > 0) {
      await this.notifyRolesRemoved(actorUserId, target, removed);
    }
    const profile = await this.toPublicProfile(targetUserId);
    if (!profile) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }
    return profile;
  }

  /**
   * In-app notification (one per role) and one email listing every role that
   * was removed. The role change is already saved, so a failure here is logged
   * instead of failing the request.
   */
  private async notifyRolesRemoved(
    actorUserId: string,
    target: User,
    removedRoles: string[],
  ): Promise<void> {
    try {
      const actor = await this.findById(actorUserId);
      const removedByDisplayName = actor?.displayName ?? 'Journal manager';
      const removalId = generateEntityId();
      const emailLocale = resolveEmailLocale({
        recipientPreferred: target.preferredLocale,
        siteDefault: this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en'),
      });
      const payload: RoleRemovedEvent = {
        type: 'RoleRemoved',
        occurredAt: new Date().toISOString(),
        idempotencyKey: roleRemovedEmailKey(removalId),
        removalId,
        roleSlugs: removedRoles,
        emailLocale,
        user: {
          id: target.id,
          email: target.email,
          displayName: target.displayName,
        },
        removedBy: { id: actorUserId, displayName: removedByDisplayName },
        loginUrl: `${this.appBaseUrl()}/login`,
      };
      const created: NonNullable<
        Awaited<ReturnType<NotificationsService['createIfAbsent']>>
      >[] = [];
      await this.roleInvRepo.manager.transaction(async (em) => {
        await this.eventPublisher.enqueue(
          ROUTING_KEY.roleInvitation,
          payload as unknown as Record<string, unknown>,
          em,
        );
        for (const roleSlug of removedRoles) {
          const notification = await this.notifications.createIfAbsent(
            {
              userId: target.id,
              type: NOTIFICATION_TYPE.ROLE_REMOVED,
              params: { removedByDisplayName, role: roleSlug },
              href: '/dashboard',
              idempotencyKey: roleRemovedNotifKey(removalId, roleSlug),
            },
            em,
          );
          if (notification) created.push(notification);
        }
      });
      if (created.length > 0) this.notifications.emitCreated(created);
    } catch (err) {
      this.logger.error(
        `role-removed notification failed for ${target.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * A journal manager may take a journal-scoped role away only from someone
   * whose seats are all on journals the manager runs. Otherwise a manager of
   * one journal could strip an editor or reviewer of another.
   */
  private async assertRemovalWithinActorJournals(
    actorUserId: string,
    targetUserId: string,
    roleSlugs: string[],
  ): Promise<void> {
    const actorIds = new Set(
      await this.journalMemberships.listJournalIdsForUser(
        actorUserId,
        ROLE_SLUGS.JOURNAL_MANAGER,
      ),
    );
    for (const roleSlug of roleSlugs) {
      const targetIds = await this.journalMemberships.listJournalIdsForUser(
        targetUserId,
        roleSlug,
      );
      if (targetIds.some((id) => !actorIds.has(id))) {
        throw new ForbiddenException({
          message: `This user holds the ${roleSlug} role on a journal you do not manage, so you cannot remove it.`,
          code: 'JOURNAL_OUT_OF_SCOPE',
        });
      }
    }
  }

  /**
   * Grants and revokes individual roles against the roles the user holds now,
   * not a list the caller read earlier. `roleSlugs` (replace the whole set) is
   * still accepted for older callers.
   */
  async changeRolesForUser(
    targetUserId: string,
    change: { roleSlugs?: string[]; add?: string[]; remove?: string[] },
    actorUserId?: string,
  ): Promise<PublicUserProfile> {
    const { roleSlugs, add, remove } = change;
    const incremental = add !== undefined || remove !== undefined;
    if ((roleSlugs !== undefined) === incremental) {
      throw new BadRequestException({
        message: 'Send either roleSlugs, or add and/or remove',
        code: 'VALIDATION_ERROR',
      });
    }
    if (roleSlugs !== undefined) {
      return this.setRolesForUser(targetUserId, roleSlugs, actorUserId);
    }
    const addSet = new Set(add ?? []);
    const removeSet = new Set(remove ?? []);
    if ([...addSet].some((slug) => removeSet.has(slug))) {
      throw new BadRequestException({
        message: 'A role cannot be added and removed in the same request',
        code: 'VALIDATION_ERROR',
      });
    }
    const target = await this.findById(targetUserId);
    if (!target) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }
    const current = await this.rbacService.getEffectiveForUser(targetUserId);
    const next = new Set(current.roleSlugs);
    for (const slug of removeSet) next.delete(slug);
    for (const slug of addSet) next.add(slug);
    next.add(ROLE_SLUGS.AUTHOR);
    return this.setRolesForUser(targetUserId, [...next], actorUserId);
  }

  async createRoleInvitation(
    actorUserId: string,
    targetUserId: string,
    roleSlug: string,
  ): Promise<RoleInvitation> {
    const allowedRoles = [
      ROLE_SLUGS.EDITOR,
      ROLE_SLUGS.JOURNAL_MANAGER,
      ROLE_SLUGS.SECTION_EDITOR,
    ] as const;
    if (!allowedRoles.includes(roleSlug as (typeof allowedRoles)[number])) {
      throw new BadRequestException({
        message:
          'Only editor, journal_manager, and section_editor role invitations are supported',
        code: 'VALIDATION_ERROR',
      });
    }
    return this.createPrivilegedRoleInvitation(
      actorUserId,
      targetUserId,
      roleSlug as (typeof allowedRoles)[number],
    );
  }

  private async createPrivilegedRoleInvitation(
    actorUserId: string,
    targetUserId: string,
    roleSlug:
      | typeof ROLE_SLUGS.EDITOR
      | typeof ROLE_SLUGS.JOURNAL_MANAGER
      | typeof ROLE_SLUGS.SECTION_EDITOR,
  ): Promise<RoleInvitation> {
    if (actorUserId === targetUserId) {
      throw new BadRequestException({
        message: 'Cannot invite yourself',
        code: 'VALIDATION_ERROR',
      });
    }
    const target = await this.findById(targetUserId);
    if (!target) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }
    const before = await this.rbacService.getEffectiveForUser(targetUserId);
    if (before.roleSlugs.includes(roleSlug)) {
      throw new BadRequestException({
        message: `User already has the ${roleSlug} role`,
        code: 'VALIDATION_ERROR',
      });
    }
    const pending = await this.roleInvRepo.findOne({
      where: {
        inviteeUserId: targetUserId,
        roleSlug,
        status: RoleInvitationStatus.INVITED,
        createdAt: MoreThanOrEqual(invitationCutoff()),
      },
    });
    if (pending) {
      throw new BadRequestException({
        message: `A pending ${roleSlug} invitation already exists for this user`,
        code: 'VALIDATION_ERROR',
      });
    }
    const invitedBy = await this.findById(actorUserId);
    let pendingNotification: Awaited<
      ReturnType<NotificationsService['createIfAbsent']>
    > = null;
    const saved = await this.roleInvRepo.manager.transaction(async (em) => {
      const roleInvRepo = em.getRepository(RoleInvitation);
      const row = roleInvRepo.create({
        inviteeUserId: targetUserId,
        invitedByUserId: actorUserId,
        roleSlug,
        status: RoleInvitationStatus.INVITED,
        resolvedAt: null,
      });
      const invitation = await roleInvRepo.save(row);
      pendingNotification = await this.enqueueRoleInvitationEmail(
        {
          invitation,
          invitee: target,
          invitedByDisplayName: invitedBy?.displayName ?? 'Journal manager',
        },
        em,
      );
      return invitation;
    });
    if (pendingNotification) {
      this.notifications.emitCreated([pendingNotification]);
    }
    return saved;
  }

  private async enqueueRoleInvitationEmail(
    args: {
      invitation: RoleInvitation;
      invitee: User;
      invitedByDisplayName: string;
    },
    em: EntityManager,
  ): Promise<Awaited<ReturnType<NotificationsService['createIfAbsent']>>> {
    const { invitation, invitee, invitedByDisplayName } = args;
    if (!invitee.email) {
      throw new InternalServerErrorException({
        message: 'Invitee email not found',
        code: 'INTERNAL_ERROR',
      });
    }
    const siteDefault = this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en');
    const emailLocale = resolveEmailLocale({
      recipientPreferred: invitee.preferredLocale,
      siteDefault,
    });
    const payload: RoleInvitationCreatedEvent = {
      type: 'RoleInvitationCreated',
      occurredAt: new Date().toISOString(),
      idempotencyKey: roleInvitationEmailKey(invitation.id),
      invitationId: invitation.id,
      roleSlug: invitation.roleSlug,
      emailLocale,
      invitee: {
        id: invitee.id,
        email: invitee.email,
        displayName: invitee.displayName,
      },
      invitedBy: {
        id: invitation.invitedByUserId,
        displayName: invitedByDisplayName,
      },
      dashboardUrl: `${this.appBaseUrl()}/dashboard`,
    };
    await this.eventPublisher.enqueue(
      ROUTING_KEY.roleInvitation,
      payload as unknown as Record<string, unknown>,
      em,
    );
    return this.notifications.createIfAbsent(
      {
        userId: invitee.id,
        type: NOTIFICATION_TYPE.ROLE_INVITATION_CREATED,
        params: {
          invitedByDisplayName,
          roleSlug: invitation.roleSlug,
        },
        href: '/dashboard',
        idempotencyKey: roleInvitationCreatedKey(invitation.id),
      },
      em,
    );
  }

  async listMyPendingRoleInvitations(
    inviteeUserId: string,
  ): Promise<PendingRoleInvitationView[]> {
    const rows = await this.roleInvRepo.find({
      where: {
        inviteeUserId,
        status: RoleInvitationStatus.INVITED,
        createdAt: MoreThanOrEqual(invitationCutoff()),
      },
      relations: ['invitedBy'],
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      roleSlug: r.roleSlug,
      createdAt: r.createdAt.toISOString(),
      invitedBy: {
        displayName: r.invitedBy.displayName,
        email: r.invitedBy.email,
      },
    }));
  }

  async acceptRoleInvitation(
    inviteeUserId: string,
    invitationId: string,
  ): Promise<PublicUserProfile> {
    const inv = await this.roleInvRepo.findOne({
      where: { id: invitationId, inviteeUserId },
      relations: ['invitee'],
    });
    if (!inv) {
      throw new NotFoundException({
        message: 'Invitation not found',
        code: 'NOT_FOUND',
      });
    }
    if (inv.status !== RoleInvitationStatus.INVITED) {
      throw new BadRequestException({
        message: 'Invitation is not pending',
        code: 'VALIDATION_ERROR',
      });
    }
    if (inv.createdAt < invitationCutoff()) {
      throw new BadRequestException({
        message: `This invitation expired after ${ROLE_INVITATION_TTL_DAYS} days. Ask a journal manager to send a new one.`,
        code: 'INVITATION_EXPIRED',
      });
    }
    const { roleSlugs } =
      await this.rbacService.getEffectiveForUser(inviteeUserId);
    const next = [...new Set([...roleSlugs, inv.roleSlug])];
    await this.rbacService.assignRoles(inviteeUserId, next);
    inv.status = RoleInvitationStatus.ACCEPTED;
    inv.resolvedAt = new Date();
    await this.roleInvRepo.save(inv);
    const profile = await this.toPublicProfile(inviteeUserId);
    if (!profile) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }
    return profile;
  }

  /** Withdraws a pending invitation so the manager can re-invite or move on. */
  async cancelRoleInvitation(
    targetUserId: string,
    invitationId: string,
  ): Promise<{ ok: true }> {
    const inv = await this.roleInvRepo.findOne({
      where: { id: invitationId, inviteeUserId: targetUserId },
    });
    if (!inv) {
      throw new NotFoundException({
        message: 'Invitation not found',
        code: 'NOT_FOUND',
      });
    }
    if (inv.status !== RoleInvitationStatus.INVITED) {
      throw new BadRequestException({
        message: 'Invitation is not pending',
        code: 'VALIDATION_ERROR',
      });
    }
    inv.status = RoleInvitationStatus.CANCELLED;
    inv.resolvedAt = new Date();
    await this.roleInvRepo.save(inv);
    return { ok: true };
  }

  async declineRoleInvitation(
    inviteeUserId: string,
    invitationId: string,
  ): Promise<{ ok: true }> {
    const inv = await this.roleInvRepo.findOne({
      where: { id: invitationId, inviteeUserId },
    });
    if (!inv) {
      throw new NotFoundException({
        message: 'Invitation not found',
        code: 'NOT_FOUND',
      });
    }
    if (inv.status !== RoleInvitationStatus.INVITED) {
      throw new BadRequestException({
        message: 'Invitation is not pending',
        code: 'VALIDATION_ERROR',
      });
    }
    inv.status = RoleInvitationStatus.DECLINED;
    inv.resolvedAt = new Date();
    await this.roleInvRepo.save(inv);
    return { ok: true };
  }

  /**
   * Section-editor scope, as journal slugs.
   *
   * Stored in `journal_memberships` and exposed as the same slugs the portal
   * URLs use.
   */
  async getSectionEditorJournals(userId: string): Promise<string[]> {
    return this.journalMemberships.journalSlugsForUser(
      userId,
      ROLE_SLUGS.SECTION_EDITOR,
    );
  }

  async setSectionEditorJournals(
    userId: string,
    journals: string[],
    actorUserId: string,
  ): Promise<string[]> {
    return this.setJournalScope(
      userId,
      ROLE_SLUGS.SECTION_EDITOR,
      journals,
      actorUserId,
    );
  }

  /**
   * Editor-in-chief scope, as journal slugs. Same storage and wire shape as
   * the section-editor scope, on separate endpoints because the roles are
   * granted separately.
   *
   * An editor with no rows here has an empty queue and can edit no journal
   * (docs/authorization.md), so this is how the journal manager puts each
   * year's editor-in-chief in charge of their journal.
   */
  async getEditorJournals(userId: string): Promise<string[]> {
    return this.journalMemberships.journalSlugsForUser(
      userId,
      ROLE_SLUGS.EDITOR,
    );
  }

  async setEditorJournals(
    userId: string,
    journals: string[],
    actorUserId: string,
  ): Promise<string[]> {
    return this.setJournalScope(
      userId,
      ROLE_SLUGS.EDITOR,
      journals,
      actorUserId,
    );
  }

  async getJournalManagerJournals(userId: string): Promise<string[]> {
    return this.journalMemberships.journalSlugsForUser(
      userId,
      ROLE_SLUGS.JOURNAL_MANAGER,
    );
  }

  /**
   * Journals this user manages. A manager handing one of their own journals
   * to this user releases that seat in the same save.
   */
  async setJournalManagerJournals(
    userId: string,
    journals: string[],
    actorUserId: string,
  ): Promise<string[]> {
    return this.setJournalScope(
      userId,
      ROLE_SLUGS.JOURNAL_MANAGER,
      journals,
      actorUserId,
    );
  }

  async getReviewerJournals(userId: string): Promise<string[]> {
    return this.journalMemberships.journalSlugsForUser(
      userId,
      ROLE_SLUGS.REVIEWER,
    );
  }

  async setReviewerJournals(
    userId: string,
    journals: string[],
    actorUserId: string,
  ): Promise<string[]> {
    return this.setJournalScope(
      userId,
      ROLE_SLUGS.REVIEWER,
      journals,
      actorUserId,
    );
  }

  /** Who holds the single editor-in-chief or journal-manager seat on each journal. */
  listJournalRoleHolders(roleSlug: string) {
    return this.journalMemberships.listSingletonRoleHolders(roleSlug);
  }

  private async setJournalScope(
    userId: string,
    roleSlug: string,
    journals: string[],
    actorUserId: string,
  ): Promise<string[]> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }
    const editorial = EDITORIAL_SEAT_ROLES.includes(roleSlug);
    const idsBefore = editorial
      ? await this.journalMemberships.listJournalIdsForUser(userId, roleSlug)
      : [];
    // Handing over a journal-manager seat releases the actor's own seat too.
    const actorBefore =
      roleSlug === ROLE_SLUGS.JOURNAL_MANAGER
        ? await this.journalMemberships.listJournalIdsForUser(
            actorUserId,
            roleSlug,
          )
        : [];
    const stored = await this.journalMemberships.setJournalSlugsWithinActor(
      actorUserId,
      userId,
      roleSlug,
      journals,
    );
    if (editorial) {
      const idsAfter = new Set(
        await this.journalMemberships.listJournalIdsForUser(userId, roleSlug),
      );
      const dropped = idsBefore.filter((id) => !idsAfter.has(id));
      if (dropped.length > 0) {
        await this.staffRelease.releaseUserFromJournals(
          userId,
          dropped,
          actorUserId,
        );
      }
    }
    if (actorBefore.length > 0 && actorUserId !== userId) {
      const actorAfter = new Set(
        await this.journalMemberships.listJournalIdsForUser(
          actorUserId,
          roleSlug,
        ),
      );
      const handedOver = actorBefore.filter((id) => !actorAfter.has(id));
      if (handedOver.length > 0) {
        await this.staffRelease.releaseUserFromJournals(
          actorUserId,
          handedOver,
          actorUserId,
        );
      }
    }
    return stored;
  }
}
