import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RbacService } from './rbac.service';
import { Permission } from '../entities/permission.entity';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { UserRole } from '../entities/user-role.entity';
import { PERMISSION_SLUGS } from './permission-slugs';

describe('RbacService', () => {
  let service: RbacService;
  let listUserIdsWithPermission: jest.Mock;

  beforeEach(async () => {
    listUserIdsWithPermission = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: getRepositoryToken(Permission), useValue: {} },
        { provide: getRepositoryToken(Role), useValue: {} },
        { provide: getRepositoryToken(RolePermission), useValue: {} },
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
    listUserIdsWithPermission.mockImplementation(async (slug: string) => {
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
});
