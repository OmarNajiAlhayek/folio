import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { User } from '../entities/user.entity';
import {
  RoleInvitation,
  RoleInvitationStatus,
} from '../entities/role-invitation.entity';
import { RbacService } from '../rbac/rbac.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { ROLE_SLUGS } from '../rbac/permission-slugs';

describe('UsersService', () => {
  let service: UsersService;
  let getManyAndCount: jest.Mock;
  let roleInvFind: jest.Mock;
  let getEffectiveForUser: jest.Mock;

  beforeEach(async () => {
    getManyAndCount = jest.fn();
    roleInvFind = jest.fn().mockResolvedValue([]);
    getEffectiveForUser = jest.fn();

    const qb = {
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount,
    };

    const usersRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        {
          provide: getRepositoryToken(RoleInvitation),
          useValue: { find: roleInvFind },
        },
        {
          provide: RbacService,
          useValue: { getEffectiveForUser },
        },
        {
          provide: NotificationsService,
          useValue: {},
        },
        {
          provide: EventPublisherService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('listForRoleAdmin returns empty when no users match', async () => {
    getManyAndCount.mockResolvedValue([[], 0]);

    const result = await service.listForRoleAdmin({
      limit: 20,
      offset: 0,
    });

    expect(result).toEqual({ items: [], total: 0 });
    expect(roleInvFind).not.toHaveBeenCalled();
  });

  it('listForRoleAdmin maps roles and pending invitations', async () => {
    const user = {
      id: 'user-1',
      email: 'a@folio.local',
      displayName: 'Author',
      affiliation: 'Dept',
      willingToReview: true,
    };
    getManyAndCount.mockResolvedValue([[user], 1]);
    getEffectiveForUser.mockResolvedValue({
      roleSlugs: [ROLE_SLUGS.AUTHOR, ROLE_SLUGS.REVIEWER],
      permissionSlugs: [],
    });
    roleInvFind.mockResolvedValue([
      {
        id: 'inv-1',
        inviteeUserId: 'user-1',
        roleSlug: ROLE_SLUGS.EDITOR,
      },
    ]);

    const result = await service.listForRoleAdmin({
      q: 'author',
      limit: 10,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'user-1',
      email: 'a@folio.local',
      willingToReview: true,
      roleSlugs: [ROLE_SLUGS.AUTHOR, ROLE_SLUGS.REVIEWER],
      pendingRoleInvitations: [
        { id: 'inv-1', roleSlug: ROLE_SLUGS.EDITOR },
      ],
    });
    expect(getEffectiveForUser).toHaveBeenCalledWith('user-1');
    expect(roleInvFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: RoleInvitationStatus.INVITED,
        }),
      }),
    );
  });
});
