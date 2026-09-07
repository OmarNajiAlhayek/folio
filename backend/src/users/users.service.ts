import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, In, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { JournalMembershipService } from '../journals/journal-membership.service';
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
import { roleInvitationCreatedKey } from '../notifications/notification-idempotency';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { ROUTING_KEY } from '@folio/shared/contracts/email-events';
import type { RoleInvitationCreatedEvent } from '@folio/shared/contracts/email-events';
import { roleInvitationEmailKey } from '@folio/shared/messaging/idempotency';
import { resolveEmailLocale } from '../common/email-locale';

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
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(OAuthIdentity)
    private readonly oauthRepo: Repository<OAuthIdentity>,
    @InjectRepository(RoleInvitation)
    private readonly roleInvRepo: Repository<RoleInvitation>,
    private readonly journalMemberships: JournalMembershipService,
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

  needsProfileCompletionForUser(user: User): boolean {
    return /^ORCID \d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(user.displayName);
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
    limit: number;
    offset: number;
  }): Promise<AdminUserListResult> {
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
      const pattern = `%${this.escapeIlikePattern(query.q)}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('u.email ILIKE :pattern', { pattern })
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
        joinedFrom: new Date(`${query.joinedFrom}T00:00:00.000Z`),
      });
    }

    if (query.joinedTo) {
      qb.andWhere('u.created_at <= :joinedTo', {
        joinedTo: new Date(`${query.joinedTo}T23:59:59.999Z`),
      });
    }

    const [users, total] = await qb.getManyAndCount();
    if (users.length === 0) {
      return { items: [], total };
    }

    const userIds = users.map((u) => u.id);
    const privilegedSlugs = [ROLE_SLUGS.EDITOR, ROLE_SLUGS.JOURNAL_MANAGER];
    const pendingInvites = await this.roleInvRepo.find({
      where: {
        inviteeUserId: In(userIds),
        status: RoleInvitationStatus.INVITED,
        roleSlug: In(privilegedSlugs),
      },
      select: ['id', 'inviteeUserId', 'roleSlug'],
    });
    const invitesByUser = new Map<string, AdminUserPendingInvitation[]>();
    for (const inv of pendingInvites) {
      const list = invitesByUser.get(inv.inviteeUserId) ?? [];
      list.push({ id: inv.id, roleSlug: inv.roleSlug });
      invitesByUser.set(inv.inviteeUserId, list);
    }

    const roleResults = await Promise.all(
      userIds.map((id) => this.rbacService.getEffectiveForUser(id)),
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
      reviewKeywords?: string | null;
      willingToReview?: boolean;
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
    if (data.reviewKeywords !== undefined)
      patch.reviewKeywords = data.reviewKeywords;
    if (data.willingToReview !== undefined)
      patch.willingToReview = data.willingToReview;
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
    await this.rbacService.assignRoles(targetUserId, unique);
    await this.authService.revokeAllSessionsForUser(targetUserId);
    const profile = await this.toPublicProfile(targetUserId);
    if (!profile) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }
    return profile;
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

  async listSectionEditorCandidates(): Promise<
    { id: string; displayName: string; email: string; disciplines: string[] }[]
  > {
    const ids = await this.rbacService.listUserIdsWithPermission(
      PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE,
    );
    if (ids.length === 0) return [];
    const [users, disciplineMap] = await Promise.all([
      this.usersRepo.find({
        where: { id: In(ids) },
        select: ['id', 'displayName', 'email'],
        order: { displayName: 'ASC' },
      }),
      this.journalMemberships.disciplineLabelsByUser(
        ids,
        ROLE_SLUGS.SECTION_EDITOR,
      ),
    ]);
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      disciplines: disciplineMap.get(u.id) ?? [],
    }));
  }

  /**
   * Section-editor scope, still expressed as discipline labels.
   *
   * Storage moved to `journal_memberships`; the label is derived from the
   * journal it maps to. The staff-admin UI keeps speaking labels until the
   * journal picker lands, so the wire contract here is deliberately unchanged.
   */
  async getSectionEditorDisciplines(userId: string): Promise<string[]> {
    return this.journalMemberships.disciplineLabelsForUser(
      userId,
      ROLE_SLUGS.SECTION_EDITOR,
    );
  }

  async setSectionEditorDisciplines(
    userId: string,
    disciplines: string[],
  ): Promise<string[]> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }
    return this.journalMemberships.setDisciplineLabelsForUser(
      userId,
      ROLE_SLUGS.SECTION_EDITOR,
      disciplines,
    );
  }
}
