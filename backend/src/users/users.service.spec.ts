import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { User } from '../entities/user.entity';
import { OAuthIdentity } from '../entities/oauth-identity.entity';
import {
  RoleInvitation,
  RoleInvitationStatus,
} from '../entities/role-invitation.entity';
import { JournalMembershipService } from '../journals/journal-membership.service';
import { RbacService } from '../rbac/rbac.service';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { ROLE_SLUGS } from '../rbac/permission-slugs';

describe('UsersService', () => {
  let service: UsersService;
  let getManyAndCount: jest.Mock;
  let roleInvFind: jest.Mock;
  let getEffectiveForUsers: jest.Mock;

  beforeEach(async () => {
    getManyAndCount = jest.fn();
    roleInvFind = jest.fn().mockResolvedValue([]);
    getEffectiveForUsers = jest.fn();

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
          provide: getRepositoryToken(OAuthIdentity),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(RoleInvitation),
          useValue: { find: roleInvFind },
        },
        {
          // Added with the section-editor feature; this suite predates it.
          provide: JournalMembershipService,
          useValue: {
            disciplineLabelsByUser: jest.fn().mockResolvedValue(new Map()),
            disciplineLabelsForUser: jest.fn().mockResolvedValue([]),
            setDisciplineLabelsForUser: jest
              .fn()
              .mockImplementation((_u: string, _r: string, labels: string[]) =>
                Promise.resolve(labels),
              ),
          },
        },
        {
          provide: RbacService,
          useValue: { getEffectiveForUsers },
        },
        {
          provide: AuthService,
          useValue: { revokeAllSessionsForUser: jest.fn() },
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
    getEffectiveForUsers.mockResolvedValue(
      new Map([
        [
          'user-1',
          {
            roleSlugs: [ROLE_SLUGS.AUTHOR, ROLE_SLUGS.REVIEWER],
            permissionSlugs: [],
          },
        ],
      ]),
    );
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
      pendingRoleInvitations: [{ id: 'inv-1', roleSlug: ROLE_SLUGS.EDITOR }],
    });
    // One batched call for the whole page, not one per row.
    expect(getEffectiveForUsers).toHaveBeenCalledTimes(1);
    expect(getEffectiveForUsers).toHaveBeenCalledWith(['user-1']);
    expect(roleInvFind).toHaveBeenCalledWith(
      expect.objectContaining({
        // jest matchers are typed as any for nested where clauses
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          status: RoleInvitationStatus.INVITED,
        }),
      }),
    );
  });
});
