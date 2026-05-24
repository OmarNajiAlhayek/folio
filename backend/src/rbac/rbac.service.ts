import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permission } from '../entities/permission.entity';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { UserRole } from '../entities/user-role.entity';
import { PERMISSION_SLUGS, ROLE_SLUGS } from './permission-slugs';

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
    ];

    for (const p of permissionDefs) {
      await this.permRepo.upsert({ slug: p.slug, description: p.description }, [
        'slug',
      ]);
    }

    const roleDefs: { slug: string; name: string }[] = [
      { slug: ROLE_SLUGS.AUTHOR, name: 'Author' },
      { slug: ROLE_SLUGS.EDITOR, name: 'Editor' },
      { slug: ROLE_SLUGS.REVIEWER, name: 'Reviewer' },
      { slug: ROLE_SLUGS.COPYEDITOR, name: 'Copyeditor' },
    ];

    for (const r of roleDefs) {
      await this.roleRepo.upsert({ slug: r.slug, name: r.name }, ['slug']);
    }

    const editorPerms = [
      PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
      PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
      PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER,
      PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS,
      PERMISSION_SLUGS.SUBMISSION_ASSIGN_COPYEDITOR,
      PERMISSION_SLUGS.USERS_MANAGE_ROLES,
      PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS,
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

    await this.ensureRolePermissions(ROLE_SLUGS.EDITOR, editorPerms);
    await this.ensureRolePermissions(ROLE_SLUGS.REVIEWER, reviewerPerms);
    await this.ensureRolePermissions(ROLE_SLUGS.COPYEDITOR, copyeditorPerms);
    // author: no extra permissions
  }

  private async ensureRolePermissions(
    roleSlug: string,
    permissionSlugs: string[],
  ): Promise<void> {
    const role = await this.roleRepo.findOne({ where: { slug: roleSlug } });
    if (!role) return;
    for (const slug of permissionSlugs) {
      const perm = await this.permRepo.findOne({ where: { slug } });
      if (!perm) continue;
      const exists = await this.rpRepo.findOne({
        where: { roleId: role.id, permissionId: perm.id },
      });
      if (!exists) {
        await this.rpRepo.save({
          roleId: role.id,
          permissionId: perm.id,
        });
      }
    }
  }

  async getEffectiveForUser(userId: string): Promise<{
    roleSlugs: string[];
    permissionSlugs: string[];
  }> {
    const rows = await this.userRoleRepo.find({
      where: { userId },
      relations: [
        'role',
        'role.rolePermissions',
        'role.rolePermissions.permission',
      ],
    });
    const roleSlugs = [...new Set(rows.map((ur) => ur.role.slug))];
    const permissionSlugs = new Set<string>();
    for (const ur of rows) {
      for (const rp of ur.role.rolePermissions ?? []) {
        if (rp.permission?.slug) {
          permissionSlugs.add(rp.permission.slug);
        }
      }
    }
    return { roleSlugs, permissionSlugs: [...permissionSlugs] };
  }

  async assignRoles(userId: string, roleSlugs: string[]): Promise<void> {
    const unique = [...new Set(roleSlugs)];
    const roles = await this.roleRepo.find({
      where: { slug: In(unique) },
    });
    if (roles.length !== unique.length) {
      const found = new Set(roles.map((r) => r.slug));
      const missing = unique.filter((s) => !found.has(s));
      throw new Error(`Unknown role slugs: ${missing.join(', ')}`);
    }
    await this.userRoleRepo.delete({ userId });
    for (const role of roles) {
      await this.userRoleRepo.save({ userId, roleId: role.id });
    }
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
