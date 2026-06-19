import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { RbacService } from './rbac.service';
import { Permission } from '../entities/permission.entity';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { UserRole } from '../entities/user-role.entity';
import { PERMISSION_SLUGS, ROLE_SLUGS } from './permission-slugs';

describe('RbacService', () => {
  let service: RbacService;
  let listUserIdsWithPermission: jest.Mock;
  let roleRepoFind: jest.Mock;
  let permRepo: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let rpRepo: {
    find: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    listUserIdsWithPermission = jest.fn();
    roleRepoFind = jest.fn().mockResolvedValue([]);
    permRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((row: Partial<Permission>) => row as Permission),
      save: jest.fn().mockResolvedValue(undefined),
    };
    rpRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: getRepositoryToken(Permission), useValue: permRepo },
        { provide: getRepositoryToken(Role), useValue: { find: roleRepoFind } },
        { provide: getRepositoryToken(RolePermission), useValue: rpRepo },
        { provide: getRepositoryToken(UserRole), useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(RbacService);
    jest
      .spyOn(service, 'listUserIdsWithPermission')
      .mockImplementation(listUserIdsWithPermission);
    jest.spyOn(service, 'onModuleInit').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('listWorkflowNotificationRecipientIds unions editors and journal managers', async () => {
    listUserIdsWithPermission.mockImplementation((slug: string) => {
      if (slug === PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS) {
        return ['editor-1', 'both-roles'];
      }
      if (slug === PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS) {
        return ['manager-1', 'both-roles'];
      }
      return [];
    });

    const ids = await service.listWorkflowNotificationRecipientIds();

    expect(ids).toEqual(
      expect.arrayContaining(['editor-1', 'manager-1', 'both-roles']),
    );
    expect(ids).toHaveLength(3);
  });

  it('batchUpsertPermissions inserts new rows in one save', async () => {
    const result = await service['batchUpsertPermissions']([
      {
        slug: PERMISSION_SLUGS.AUDIT_LOG_VIEW,
        description: 'View audit log',
      },
    ]);

    expect(permRepo.find).toHaveBeenCalledTimes(1);
    expect(permRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        slug: PERMISSION_SLUGS.AUDIT_LOG_VIEW,
        description: 'View audit log',
      }),
    ]);
    expect(result.get(PERMISSION_SLUGS.AUDIT_LOG_VIEW)).toEqual(
      expect.objectContaining({ slug: PERMISSION_SLUGS.AUDIT_LOG_VIEW }),
    );
  });

  it('batchUpsertPermissions updates descriptions in one save', async () => {
    const existing = {
      id: 'perm-existing',
      slug: PERMISSION_SLUGS.AUDIT_LOG_VIEW,
      description: 'Old description',
    };
    permRepo.find.mockResolvedValue([existing]);

    await service['batchUpsertPermissions']([
      {
        slug: PERMISSION_SLUGS.AUDIT_LOG_VIEW,
        description: 'View audit log',
      },
    ]);

    expect(permRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'perm-existing',
        description: 'View audit log',
      }),
    ]);
  });

  it('batchSyncRolePermissions inserts and deletes links in bulk', async () => {
    const role = { id: 'role-editor', slug: ROLE_SLUGS.EDITOR, name: 'Editor' };
    const keepPerm = {
      id: 'perm-keep',
      slug: PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
      description: 'Change status',
    };
    const addPerm = {
      id: 'perm-add',
      slug: PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER,
      description: 'Assign reviewer',
    };
    rpRepo.find.mockResolvedValue([
      { roleId: role.id, permissionId: 'perm-stale' },
      { roleId: role.id, permissionId: keepPerm.id },
    ]);

    await service['batchSyncRolePermissions'](
      [
        {
          roleSlug: ROLE_SLUGS.EDITOR,
          permissionSlugs: [
            PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
            PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER,
          ],
        },
      ],
      new Map([[ROLE_SLUGS.EDITOR, role as Role]]),
      new Map([
        [keepPerm.slug, keepPerm as Permission],
        [addPerm.slug, addPerm as Permission],
      ]),
    );

    expect(rpRepo.find).toHaveBeenCalledTimes(1);
    expect(rpRepo.save).toHaveBeenCalledWith([
      { roleId: role.id, permissionId: addPerm.id },
    ]);
    expect(rpRepo.delete).toHaveBeenCalledWith({
      roleId: role.id,
      permissionId: In(['perm-stale']),
    });
  });

  it('assignRoles throws BadRequestException for unknown role slugs', async () => {
    jest.spyOn(service, 'getEffectiveForUser').mockResolvedValue({
      roleSlugs: [],
      permissionSlugs: [],
    });
    roleRepoFind.mockResolvedValue([
      { id: 'role-author', slug: ROLE_SLUGS.AUTHOR },
    ]);

    const err = service.assignRoles('user-1', [ROLE_SLUGS.AUTHOR, 'bogus']);
    await expect(err).rejects.toBeInstanceOf(BadRequestException);
    await expect(err).rejects.toMatchObject({
      response: {
        message: 'Unknown role slugs: bogus',
        code: 'VALIDATION_ERROR',
      },
    });
  });
});
