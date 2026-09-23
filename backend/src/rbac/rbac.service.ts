import { generateEntityId } from '@folio/shared';
import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permission } from '../entities/permission.entity';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { UserRole } from '../entities/user-role.entity';
import { PERMISSION_SLUGS, ROLE_SLUGS } from './permission-slugs';

/** What a user can do, flattened across every role they hold. */
export type EffectiveAccess = {
  roleSlugs: string[];
  permissionSlugs: string[];
};

@Injectable()
export class RbacService implements OnModuleInit {
  constructor(
    @InjectRepository(Permission)
    private readonly permRepo: Repository<Permission>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(RolePermission)
    private readonly rpRepo: Repository<RolePermission>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
  ) {}

  async onModuleInit() {
    await this.ensureSeed();
  }

  /** Idempotent: upsert permissions, roles, and role_permission links. */
  async ensureSeed(): Promise<void> {
    const permissionDefs: { slug: string; description: string }[] = [
      {
        slug: PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN,
        description:
          'Create and manage own manuscript submissions (draft, submit, files)',
      },
      {
        slug: PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
        description: 'View submissions queue (non-draft)',
      },
      {
        slug: PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
        description: 'Change submission workflow status',
      },
      {
        slug: PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER,
        description: 'Assign reviewers to submissions',
      },
      {
        slug: PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS,
        description: 'List review assignments on a submission',
      },
      {
        slug: PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN,
        description: 'View own reviewer assignments',
      },
      {
        slug: PERMISSION_SLUGS.REVIEW_SUBMIT,
        description: 'Submit a review for an assignment',
      },
      {
        slug: PERMISSION_SLUGS.USERS_MANAGE_ROLES,
        description: 'Assign roles to users',
      },
      {
        slug: PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS,
        description: 'Configure email reminder rules and templates',
      },
      {
        slug: PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS,
        description:
          'Reschedule or cancel pending review reminders on an assignment',
      },
      {
        slug: PERMISSION_SLUGS.SUBMISSION_ASSIGN_COPYEDITOR,
        description: 'Assign a copyeditor to an accepted submission',
      },
      {
        slug: PERMISSION_SLUGS.COPYEDIT_VIEW_QUEUE,
        description: 'View own copyediting assignments queue',
      },
      {
        slug: PERMISSION_SLUGS.COPYEDIT_SUBMIT_NOTE,
        description: 'Submit copyediting notes for a submission',
      },
      {
        slug: PERMISSION_SLUGS.COPYEDIT_PUBLISH,
        description: 'Publish a submission after copyediting',
      },
      {
        slug: PERMISSION_SLUGS.AUDIT_LOG_VIEW,
        description: 'View the full audit log of all user actions',
      },
      {
        slug: PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE,
        description:
          'View submissions assigned to this section editor (section queue)',
      },
      {
        slug: PERMISSION_SLUGS.SUBMISSION_ASSIGN_SECTION_EDITOR,
        description: 'Assign a section editor to a submission',
      },
      {
        slug: PERMISSION_SLUGS.JOURNAL_EDIT_METADATA,
        description: "Edit a journal's ISSNs and aims and scope",
      },
      {
        slug: PERMISSION_SLUGS.JOURNAL_EDIT_TITLES,
        description: "Edit a journal's registered titles",
      },
    ];

    const permBySlug = await this.batchUpsertPermissions(permissionDefs);

    const roleDefs: { slug: string; name: string }[] = [
      { slug: ROLE_SLUGS.AUTHOR, name: 'Author' },
      { slug: ROLE_SLUGS.EDITOR, name: 'Editor' },
      { slug: ROLE_SLUGS.SECTION_EDITOR, name: 'Section Editor' },
      { slug: ROLE_SLUGS.JOURNAL_MANAGER, name: 'Journal manager' },
      { slug: ROLE_SLUGS.REVIEWER, name: 'Reviewer' },
      { slug: ROLE_SLUGS.COPYEDITOR, name: 'Copyeditor' },
    ];

    const roleBySlug = await this.batchUpsertRoles(roleDefs);

    const editorPerms = [
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
      PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
      PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER,
      PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS,
      PERMISSION_SLUGS.SUBMISSION_ASSIGN_COPYEDITOR,
      PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS,
      PERMISSION_SLUGS.SUBMISSION_ASSIGN_SECTION_EDITOR,
      // Chief editor can publish when the assigned copyeditor cannot
      // (leave, lockout). The service still requires every assignment
      // ready_for_review — this is an actor override, not a quality skip.
      PERMISSION_SLUGS.COPYEDIT_PUBLISH,
      // ISSNs and aims and scope of the editor's own journals only — the
      // service checks the membership. Titles stay with the journal manager.
      PERMISSION_SLUGS.JOURNAL_EDIT_METADATA,
    ];
    const sectionEditorPerms = [
      PERMISSION_SLUGS.SUBMISSION_VIEW_SECTION_QUEUE,
      PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
      PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER,
      PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS,
      PERMISSION_SLUGS.SUBMISSION_ASSIGN_COPYEDITOR,
      PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS,
    ];
    const journalManagerPerms = [
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
      PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS,
      PERMISSION_SLUGS.USERS_MANAGE_ROLES,
      PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS,
      PERMISSION_SLUGS.EMAIL_MANAGE_ASSIGNMENT_REMINDERS,
      PERMISSION_SLUGS.AUDIT_LOG_VIEW,
    ];
    const reviewerPerms = [
      PERMISSION_SLUGS.ASSIGNMENT_VIEW_OWN,
      PERMISSION_SLUGS.REVIEW_SUBMIT,
    ];
    const copyeditorPerms = [
      PERMISSION_SLUGS.COPYEDIT_VIEW_QUEUE,
      PERMISSION_SLUGS.COPYEDIT_SUBMIT_NOTE,
      PERMISSION_SLUGS.COPYEDIT_PUBLISH,
    ];

    const authorPerms = [PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN];

    await this.batchSyncRolePermissions(
      [
        { roleSlug: ROLE_SLUGS.AUTHOR, permissionSlugs: authorPerms },
        { roleSlug: ROLE_SLUGS.EDITOR, permissionSlugs: editorPerms },
        {
          roleSlug: ROLE_SLUGS.SECTION_EDITOR,
          permissionSlugs: sectionEditorPerms,
        },
        {
          roleSlug: ROLE_SLUGS.JOURNAL_MANAGER,
          permissionSlugs: journalManagerPerms,
        },
        { roleSlug: ROLE_SLUGS.REVIEWER, permissionSlugs: reviewerPerms },
        { roleSlug: ROLE_SLUGS.COPYEDITOR, permissionSlugs: copyeditorPerms },
      ],
      roleBySlug,
      permBySlug,
    );
  }

  private async batchUpsertPermissions(
    defs: { slug: string; description: string }[],
  ): Promise<Map<string, Permission>> {
    if (defs.length === 0) return new Map();

    const existing = await this.permRepo.find({
      where: { slug: In(defs.map((d) => d.slug)) },
    });
    const bySlug = new Map(existing.map((p) => [p.slug, p]));

    const toInsert: Permission[] = [];
    const toUpdate: Permission[] = [];
    for (const def of defs) {
      const row = bySlug.get(def.slug);
      if (!row) {
        const created = this.permRepo.create({
          id: generateEntityId(),
          slug: def.slug,
          description: def.description,
        });
        toInsert.push(created);
        bySlug.set(def.slug, created);
        continue;
      }
      if (row.description !== def.description) {
        row.description = def.description;
        toUpdate.push(row);
      }
    }

    if (toInsert.length > 0) await this.permRepo.save(toInsert);
    if (toUpdate.length > 0) await this.permRepo.save(toUpdate);
    return bySlug;
  }

  private async batchUpsertRoles(
    defs: { slug: string; name: string }[],
  ): Promise<Map<string, Role>> {
    if (defs.length === 0) return new Map();

    const existing = await this.roleRepo.find({
      where: { slug: In(defs.map((d) => d.slug)) },
    });
    const bySlug = new Map(existing.map((r) => [r.slug, r]));

    const toInsert: Role[] = [];
    const toUpdate: Role[] = [];
    for (const def of defs) {
      const row = bySlug.get(def.slug);
      if (!row) {
        const created = this.roleRepo.create({
          id: generateEntityId(),
          slug: def.slug,
          name: def.name,
        });
        toInsert.push(created);
        bySlug.set(def.slug, created);
        continue;
      }
      if (row.name !== def.name) {
        row.name = def.name;
        toUpdate.push(row);
      }
    }

    if (toInsert.length > 0) await this.roleRepo.save(toInsert);
    if (toUpdate.length > 0) await this.roleRepo.save(toUpdate);
    return bySlug;
  }

  private rolePermissionKey(roleId: string, permissionId: string): string {
    return `${roleId}\0${permissionId}`;
  }

  /** Upsert links for each role and remove stale permissions in bulk. */
  private async batchSyncRolePermissions(
    matrix: { roleSlug: string; permissionSlugs: string[] }[],
    roleBySlug: Map<string, Role>,
    permBySlug: Map<string, Permission>,
  ): Promise<void> {
    const roleIds = matrix
      .map((entry) => roleBySlug.get(entry.roleSlug)?.id)
      .filter((id): id is string => Boolean(id));
    if (roleIds.length === 0) return;

    const desiredKeys = new Set<string>();
    for (const { roleSlug, permissionSlugs } of matrix) {
      const role = roleBySlug.get(roleSlug);
      if (!role) continue;
      for (const permSlug of permissionSlugs) {
        const perm = permBySlug.get(permSlug);
        if (!perm) continue;
        desiredKeys.add(this.rolePermissionKey(role.id, perm.id));
      }
    }

    const existing = await this.rpRepo.find({
      where: { roleId: In([...new Set(roleIds)]) },
    });
    const existingKeys = new Set(
      existing.map((rp) => this.rolePermissionKey(rp.roleId, rp.permissionId)),
    );

    const toInsert = [...desiredKeys]
      .filter((key) => !existingKeys.has(key))
      .map((key) => {
        const [roleId, permissionId] = key.split('\0');
        return { roleId, permissionId };
      });
    if (toInsert.length > 0) await this.rpRepo.save(toInsert);

    const staleByRole = new Map<string, string[]>();
    for (const rp of existing) {
      const key = this.rolePermissionKey(rp.roleId, rp.permissionId);
      if (desiredKeys.has(key)) continue;
      const permissionIds = staleByRole.get(rp.roleId) ?? [];
      permissionIds.push(rp.permissionId);
      staleByRole.set(rp.roleId, permissionIds);
    }
    for (const [roleId, permissionIds] of staleByRole) {
      await this.rpRepo.delete({ roleId, permissionId: In(permissionIds) });
    }
  }

  async getEffectiveForUser(userId: string): Promise<EffectiveAccess> {
    const byUser = await this.getEffectiveForUsers([userId]);
    return byUser.get(userId) ?? { roleSlugs: [], permissionSlugs: [] };
  }

  /**
   * Effective roles and permissions for several users in one query.
   *
   * The single-user form is a wrapper around this. Resolving a page of users by
   * calling it per row was an N+1: twenty users meant twenty queries, each
   * joining three levels of relations.
   *
   * Users with no roles are absent from the map rather than present and empty —
   * callers that need a row per user should fall back explicitly.
   */
  async getEffectiveForUsers(
    userIds: readonly string[],
  ): Promise<Map<string, EffectiveAccess>> {
    const unique = [...new Set(userIds.filter(Boolean))];
    const byUser = new Map<string, EffectiveAccess>();
    if (unique.length === 0) return byUser;

    const rows = await this.userRoleRepo.find({
      where: { userId: In(unique) },
      relations: [
        'role',
        'role.rolePermissions',
        'role.rolePermissions.permission',
      ],
    });

    const roleSlugsByUser = new Map<string, Set<string>>();
    const permissionSlugsByUser = new Map<string, Set<string>>();
    for (const ur of rows) {
      const roles = roleSlugsByUser.get(ur.userId) ?? new Set<string>();
      roles.add(ur.role.slug);
      roleSlugsByUser.set(ur.userId, roles);

      const perms = permissionSlugsByUser.get(ur.userId) ?? new Set<string>();
      for (const rp of ur.role.rolePermissions ?? []) {
        if (rp.permission?.slug) perms.add(rp.permission.slug);
      }
      permissionSlugsByUser.set(ur.userId, perms);
    }

    for (const [userId, roles] of roleSlugsByUser) {
      byUser.set(userId, {
        roleSlugs: [...roles],
        permissionSlugs: [...(permissionSlugsByUser.get(userId) ?? [])],
      });
    }
    return byUser;
  }

  async assignRoles(
    userId: string,
    roleSlugs: string[],
  ): Promise<{
    before: { roleSlugs: string[]; permissionSlugs: string[] };
    after: { roleSlugs: string[]; permissionSlugs: string[] };
  }> {
    const before = await this.getEffectiveForUser(userId);
    const unique = [...new Set(roleSlugs)];
    const roles = await this.roleRepo.find({
      where: { slug: In(unique) },
    });
    if (roles.length !== unique.length) {
      const found = new Set(roles.map((r) => r.slug));
      const missing = unique.filter((s) => !found.has(s));
      throw new BadRequestException({
        message: `Unknown role slugs: ${missing.join(', ')}`,
        code: 'VALIDATION_ERROR',
      });
    }
    await this.userRoleRepo.delete({ userId });
    for (const role of roles) {
      await this.userRoleRepo.save({ userId, roleId: role.id });
    }
    const after = await this.getEffectiveForUser(userId);
    return { before, after };
  }

  async addAuthorRoleIfNone(userId: string): Promise<void> {
    const count = await this.userRoleRepo.count({ where: { userId } });
    if (count > 0) return;
    const author = await this.roleRepo.findOne({
      where: { slug: ROLE_SLUGS.AUTHOR },
    });
    if (!author) return;
    await this.userRoleRepo.save({ userId, roleId: author.id });
  }

  async userHasPermission(
    userId: string,
    permission: string,
  ): Promise<boolean> {
    const { permissionSlugs } = await this.getEffectiveForUser(userId);
    return permissionSlugs.includes(permission);
  }

  /** Distinct user IDs that have the given permission via any of their roles. */
  async listUserIdsWithPermission(permissionSlug: string): Promise<string[]> {
    const rows = await this.userRoleRepo
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'role')
      .innerJoin('role.rolePermissions', 'rp')
      .innerJoin('rp.permission', 'perm')
      .where('perm.slug = :slug', { slug: permissionSlug })
      .select('DISTINCT ur.userId', 'userId')
      .getRawMany<{ userId: string }>();
    return rows.map((r) => r.userId);
  }

  /**
   * Editors and journal managers who receive workflow emails and in-app
   * notifications (new submissions, review activity).
   */
  async listWorkflowNotificationRecipientIds(): Promise<string[]> {
    const [editorIds, journalManagerIds] = await Promise.all([
      this.listUserIdsWithPermission(PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS),
      this.listUserIdsWithPermission(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS),
    ]);
    return [...new Set([...editorIds, ...journalManagerIds])];
  }

  async countUsersWithRoleSlug(slug: string): Promise<number> {
    const role = await this.roleRepo.findOne({ where: { slug } });
    if (!role) return 0;
    return this.userRoleRepo.count({ where: { roleId: role.id } });
  }

  async findRoleIdsBySlugs(slugs: string[]): Promise<Map<string, string>> {
    if (slugs.length === 0) return new Map();
    const roles = await this.roleRepo.find({
      where: { slug: In([...new Set(slugs)]) },
    });
    return new Map(roles.map((r) => [r.slug, r.id]));
  }
}
