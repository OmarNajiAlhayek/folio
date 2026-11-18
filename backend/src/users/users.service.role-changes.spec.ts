import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService, ROLE_INVITATION_TTL_DAYS } from './users.service';
import { User } from '../entities/user.entity';
import { OAuthIdentity } from '../entities/oauth-identity.entity';
import {
  RoleInvitation,
  RoleInvitationStatus,
} from '../entities/role-invitation.entity';
import { JournalMembershipService } from '../journals/journal-membership.service';
import { StaffReleaseService } from '../journals/staff-release.service';
import { RbacService } from '../rbac/rbac.service';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { ROLE_SLUGS } from '../rbac/permission-slugs';

const ACTOR = 'actor-1';
const TARGET = 'target-1';

describe('UsersService role changes', () => {
  let service: UsersService;
  let roles: string[];
  let assignRoles: jest.Mock;
  let revokeAllSessionsForUser: jest.Mock;
  let removeRoleMemberships: jest.Mock;
  let releaseUserFromAllJournals: jest.Mock;
  let releaseUserFromJournals: jest.Mock;
  let listJournalIdsForUser: jest.Mock;
  let roleInvFind: jest.Mock;
  let roleInvFindOne: jest.Mock;
  let roleInvSave: jest.Mock;
  let enqueue: jest.Mock;
  let createIfAbsent: jest.Mock;
  let emitCreated: jest.Mock;
  let memberships: Record<string, Record<string, string[]>>;

  beforeEach(async () => {
    roles = [ROLE_SLUGS.AUTHOR, ROLE_SLUGS.REVIEWER, ROLE_SLUGS.EDITOR];
    memberships = {};
    assignRoles = jest
      .fn()
      .mockImplementation((_id: string, next: string[]) => {
        const before = { roleSlugs: [...roles], permissionSlugs: [] };
        roles = [...next];
        return Promise.resolve({
          before,
          after: { roleSlugs: [...roles], permissionSlugs: [] },
        });
      });
    revokeAllSessionsForUser = jest.fn().mockResolvedValue(1);
    removeRoleMemberships = jest.fn().mockResolvedValue(undefined);
    releaseUserFromAllJournals = jest.fn().mockResolvedValue(undefined);
    releaseUserFromJournals = jest.fn().mockResolvedValue(undefined);
    listJournalIdsForUser = jest
      .fn()
      .mockImplementation((userId: string, role: string) =>
        Promise.resolve(memberships[userId]?.[role] ?? []),
      );
    enqueue = jest.fn().mockResolvedValue(undefined);
    createIfAbsent = jest
      .fn()
      .mockImplementation((n: { type: string }) => Promise.resolve(n));
    emitCreated = jest.fn();
    roleInvFind = jest.fn().mockResolvedValue([]);
    roleInvFindOne = jest.fn();
    roleInvSave = jest
      .fn()
      .mockImplementation((x: unknown) => Promise.resolve(x));

    const usersRepo = {
      findOne: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve(
            where.id === TARGET || where.id === ACTOR
              ? {
                  id: where.id,
                  email: `${where.id}@folio.local`,
                  displayName: where.id,
                  passwordHash: 'x',
                  orcid: null,
                  emailVerifiedAt: null,
                  reviewerAvailable: true,
                  reviewerUnavailableUntil: null,
                  reviewerUnavailableNote: null,
                  reviewerMaxActiveReviews: null,
                  preferredLocale: null,
                }
              : null,
          ),
        ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        {
          provide: getRepositoryToken(OAuthIdentity),
          useValue: { exists: jest.fn().mockResolvedValue(false) },
        },
        {
          provide: getRepositoryToken(RoleInvitation),
          useValue: {
            find: roleInvFind,
            findOne: roleInvFindOne,
            save: roleInvSave,
            manager: {
              transaction: (fn: (em: unknown) => Promise<unknown>) => fn({}),
            },
          },
        },
        {
          provide: JournalMembershipService,
          useValue: { listJournalIdsForUser, removeRoleMemberships },
        },
        {
          provide: StaffReleaseService,
          useValue: { releaseUserFromAllJournals, releaseUserFromJournals },
        },
        {
          provide: RbacService,
          useValue: {
            getEffectiveForUser: jest
              .fn()
              .mockImplementation(() =>
                Promise.resolve({ roleSlugs: [...roles], permissionSlugs: [] }),
              ),
            countUsersWithRoleSlug: jest.fn().mockResolvedValue(5),
            assignRoles,
          },
        },
        { provide: AuthService, useValue: { revokeAllSessionsForUser } },
        {
          provide: NotificationsService,
          useValue: { createIfAbsent, emitCreated },
        },
        { provide: EventPublisherService, useValue: { enqueue } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('changeRolesForUser', () => {
    it('adds one role against the current roles, keeping roles the page did not know about', async () => {
      // The user holds `editor` (accepted an invitation after the page loaded).
      await service.changeRolesForUser(
        TARGET,
        { add: [ROLE_SLUGS.COPYEDITOR] },
        ACTOR,
      );
      expect(assignRoles).toHaveBeenCalledTimes(1);
      const [, next] = assignRoles.mock.calls[0] as [string, string[]];
      expect(next).toEqual(
        expect.arrayContaining([
          ROLE_SLUGS.AUTHOR,
          ROLE_SLUGS.REVIEWER,
          ROLE_SLUGS.EDITOR,
          ROLE_SLUGS.COPYEDITOR,
        ]),
      );
    });

    it('rejects a request that mixes roleSlugs with add/remove, or sends nothing', async () => {
      await expect(
        service.changeRolesForUser(
          TARGET,
          { roleSlugs: ['author'], add: ['reviewer'] },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.changeRolesForUser(TARGET, {}, ACTOR),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects adding and removing the same role', async () => {
      await expect(
        service.changeRolesForUser(
          TARGET,
          { add: ['reviewer'], remove: ['reviewer'] },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s for an unknown user', async () => {
      await expect(
        service.changeRolesForUser('nobody', { add: ['reviewer'] }, ACTOR),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setRolesForUser', () => {
    it('refuses to grant section_editor directly (invitation only)', async () => {
      await expect(
        service.setRolesForUser(
          TARGET,
          [...roles, ROLE_SLUGS.SECTION_EDITOR],
          ACTOR,
        ),
      ).rejects.toMatchObject({
        response: { code: 'VALIDATION_ERROR' },
      });
      expect(assignRoles).not.toHaveBeenCalled();
    });

    it('refuses to remove a scoped role from someone seated on another journal', async () => {
      memberships[ACTOR] = { [ROLE_SLUGS.JOURNAL_MANAGER]: ['j-a'] };
      memberships[TARGET] = { [ROLE_SLUGS.EDITOR]: ['j-b'] };
      await expect(
        service.changeRolesForUser(
          TARGET,
          { remove: [ROLE_SLUGS.EDITOR] },
          ACTOR,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(assignRoles).not.toHaveBeenCalled();
      expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
    });

    it('removes the role, clears its journal scope and signs the user out when in scope', async () => {
      memberships[ACTOR] = { [ROLE_SLUGS.JOURNAL_MANAGER]: ['j-a', 'j-b'] };
      memberships[TARGET] = { [ROLE_SLUGS.EDITOR]: ['j-a'] };
      await service.changeRolesForUser(
        TARGET,
        { remove: [ROLE_SLUGS.EDITOR] },
        ACTOR,
      );
      expect(assignRoles).toHaveBeenCalled();
      expect(removeRoleMemberships).toHaveBeenCalledWith(TARGET, [
        ROLE_SLUGS.EDITOR,
      ]);
      expect(revokeAllSessionsForUser).toHaveBeenCalledWith(TARGET);
    });

    it('takes the person off the journal papers when an editorial role is removed', async () => {
      memberships[ACTOR] = { [ROLE_SLUGS.JOURNAL_MANAGER]: ['j-a'] };
      memberships[TARGET] = { [ROLE_SLUGS.EDITOR]: ['j-a'] };
      await service.changeRolesForUser(
        TARGET,
        { remove: [ROLE_SLUGS.EDITOR] },
        ACTOR,
      );
      expect(releaseUserFromAllJournals).toHaveBeenCalledWith(TARGET, ACTOR);
    });

    it('does not touch assignments when only the reviewer role is removed', async () => {
      await service.changeRolesForUser(
        TARGET,
        { remove: [ROLE_SLUGS.REVIEWER] },
        ACTOR,
      );
      expect(releaseUserFromAllJournals).not.toHaveBeenCalled();
    });

    it('emails and notifies the person whose role was removed', async () => {
      memberships[ACTOR] = { [ROLE_SLUGS.JOURNAL_MANAGER]: ['j-a'] };
      memberships[TARGET] = { [ROLE_SLUGS.EDITOR]: ['j-a'] };
      await service.changeRolesForUser(
        TARGET,
        { remove: [ROLE_SLUGS.EDITOR, ROLE_SLUGS.REVIEWER] },
        ACTOR,
      );
      expect(enqueue).toHaveBeenCalledTimes(1);
      const [routingKey, payload] = enqueue.mock.calls[0] as [
        string,
        { type: string; roleSlugs: string[]; user: { id: string } },
      ];
      expect(routingKey).toBe('role.invitation');
      expect(payload.type).toBe('RoleRemoved');
      expect(payload.roleSlugs.sort()).toEqual(
        [ROLE_SLUGS.EDITOR, ROLE_SLUGS.REVIEWER].sort(),
      );
      expect(payload.user.id).toBe(TARGET);
      // One in-app notification per removed role, pushed live once committed.
      expect(createIfAbsent).toHaveBeenCalledTimes(2);
      expect(emitCreated).toHaveBeenCalledTimes(1);
    });

    it('sends nothing when the person gives up their own role', async () => {
      await service.setRolesForUser(
        ACTOR,
        [ROLE_SLUGS.AUTHOR, ROLE_SLUGS.REVIEWER],
        ACTOR,
      );
      expect(assignRoles).toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
      expect(createIfAbsent).not.toHaveBeenCalled();
    });

    it('does not fail the role change when the notification cannot be queued', async () => {
      memberships[ACTOR] = { [ROLE_SLUGS.JOURNAL_MANAGER]: ['j-a'] };
      memberships[TARGET] = { [ROLE_SLUGS.EDITOR]: ['j-a'] };
      enqueue.mockRejectedValue(new Error('outbox down'));
      await expect(
        service.changeRolesForUser(
          TARGET,
          { remove: [ROLE_SLUGS.EDITOR] },
          ACTOR,
        ),
      ).resolves.toBeDefined();
      expect(revokeAllSessionsForUser).toHaveBeenCalledWith(TARGET);
    });

    it('does not sign the user out when the role set did not change', async () => {
      await service.setRolesForUser(TARGET, [...roles], ACTOR);
      expect(revokeAllSessionsForUser).not.toHaveBeenCalled();
    });
  });

  describe('invitations', () => {
    it('lists pending section_editor invitations for the admin screen', async () => {
      // listForRoleAdmin is covered elsewhere; this pins the slug filter.
      const usersRepoQb = {
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([
            [{ id: TARGET, email: 'a', displayName: 'A' }],
            1,
          ]),
      };
      const repo = (
        service as unknown as { usersRepo: { createQueryBuilder: jest.Mock } }
      ).usersRepo;
      repo.createQueryBuilder = jest.fn().mockReturnValue(usersRepoQb);
      (
        service as unknown as {
          rbacService: { getEffectiveForUsers: jest.Mock };
        }
      ).rbacService.getEffectiveForUsers = jest
        .fn()
        .mockResolvedValue(new Map());

      await service.listForRoleAdmin({ limit: 10, offset: 0 });

      const [{ where }] = roleInvFind.mock.calls[0] as [
        { where: { roleSlug: { _value: string[] } } },
      ];
      const slugs = where.roleSlug._value;
      expect(slugs).toContain(ROLE_SLUGS.SECTION_EDITOR);
    });

    it('cancels a pending invitation', async () => {
      const inv = { id: 'i1', status: RoleInvitationStatus.INVITED };
      roleInvFindOne.mockResolvedValue(inv);
      await expect(service.cancelRoleInvitation(TARGET, 'i1')).resolves.toEqual(
        {
          ok: true,
        },
      );
      expect(inv.status).toBe(RoleInvitationStatus.CANCELLED);
      expect(roleInvSave).toHaveBeenCalled();
    });

    it('will not cancel an invitation that was already answered', async () => {
      roleInvFindOne.mockResolvedValue({
        id: 'i1',
        status: RoleInvitationStatus.ACCEPTED,
      });
      await expect(
        service.cancelRoleInvitation(TARGET, 'i1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to accept an expired invitation', async () => {
      roleInvFindOne.mockResolvedValue({
        id: 'i1',
        inviteeUserId: TARGET,
        roleSlug: ROLE_SLUGS.EDITOR,
        status: RoleInvitationStatus.INVITED,
        createdAt: new Date(
          Date.now() - (ROLE_INVITATION_TTL_DAYS + 1) * 86_400_000,
        ),
      });
      await expect(
        service.acceptRoleInvitation(TARGET, 'i1'),
      ).rejects.toMatchObject({ response: { code: 'INVITATION_EXPIRED' } });
      expect(assignRoles).not.toHaveBeenCalled();
    });
  });
});
