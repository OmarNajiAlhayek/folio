import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UsersService } from './users.service';
import { User } from '../entities/user.entity';
import { OAuthIdentity } from '../entities/oauth-identity.entity';
import { RoleInvitation } from '../entities/role-invitation.entity';
import { JournalMembershipService } from '../journals/journal-membership.service';
import { RbacService } from '../rbac/rbac.service';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventPublisherService } from '../messaging/event-publisher.service';
import { PatchResearcherProfileDto } from '../auth/dto/patch-researcher-profile.dto';

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

describe('UsersService reviewer availability', () => {
  let service: UsersService;
  let update: jest.Mock;
  let stored: User;

  beforeEach(async () => {
    stored = {
      id: 'rev-1',
      email: 'rev@uni.edu',
      displayName: 'Reviewer One',
      orcid: '0000-0002-1825-0097',
      willingToReview: true,
      reviewerAvailable: false,
      reviewerUnavailableUntil: isoDay(30),
      reviewerUnavailableNote: 'Sabbatical',
      reviewerMaxActiveReviews: 3,
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
    } as User;
    update = jest.fn((_where: unknown, patch: Partial<User>) => {
      Object.assign(stored, patch);
      return Promise.resolve();
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(() => Promise.resolve(stored)),
            update,
          },
        },
        {
          provide: getRepositoryToken(OAuthIdentity),
          useValue: { exists: jest.fn().mockResolvedValue(false) },
        },
        { provide: getRepositoryToken(RoleInvitation), useValue: {} },
        { provide: JournalMembershipService, useValue: {} },
        {
          provide: RbacService,
          useValue: {
            getEffectiveForUser: jest
              .fn()
              .mockResolvedValue({ roleSlugs: [], permissionSlugs: [] }),
          },
        },
        { provide: AuthService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: EventPublisherService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('reports the stored absence and limit on the profile', async () => {
    const profile = await service.patchMyResearcherProfile('rev-1', {});
    expect(profile.reviewerAvailability).toEqual({
      available: false,
      unavailableUntil: stored.reviewerUnavailableUntil,
      note: 'Sabbatical',
      maxActiveReviews: 3,
    });
  });

  it('clears the return date and note when going available', async () => {
    await service.patchMyResearcherProfile('rev-1', {
      reviewerAvailable: true,
    });
    expect(update).toHaveBeenCalledWith(
      { id: 'rev-1' },
      {
        reviewerAvailable: true,
        reviewerUnavailableUntil: null,
        reviewerUnavailableNote: null,
      },
    );
  });

  it('stores an absence with a future return date and trimmed note', async () => {
    const until = isoDay(7);
    await service.patchMyResearcherProfile('rev-1', {
      reviewerAvailable: false,
      reviewerUnavailableUntil: until,
      reviewerUnavailableNote: '  Conference travel  ',
    });
    expect(update).toHaveBeenCalledWith(
      { id: 'rev-1' },
      {
        reviewerAvailable: false,
        reviewerUnavailableUntil: until,
        reviewerUnavailableNote: 'Conference travel',
      },
    );
  });

  it.each([
    ['today', 0],
    ['yesterday', -1],
  ])('rejects a return date of %s', async (_label, offset) => {
    await expect(
      service.patchMyResearcherProfile('rev-1', {
        reviewerAvailable: false,
        reviewerUnavailableUntil: isoDay(offset),
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(update).not.toHaveBeenCalled();
  });

  it('removes the limit with null', async () => {
    await service.patchMyResearcherProfile('rev-1', {
      reviewerMaxActiveReviews: null,
    });
    expect(update).toHaveBeenCalledWith(
      { id: 'rev-1' },
      { reviewerMaxActiveReviews: null },
    );
  });
});

describe('PatchResearcherProfileDto reviewer fields', () => {
  async function errorsFor(body: Record<string, unknown>) {
    const errors = await validate(
      plainToInstance(PatchResearcherProfileDto, body),
    );
    return errors.map((e) => e.property);
  }

  it.each([0, 51, 2.5])('rejects a limit of %s', async (n) => {
    expect(await errorsFor({ reviewerMaxActiveReviews: n })).toEqual([
      'reviewerMaxActiveReviews',
    ]);
  });

  it('accepts a limit of 1 and of null', async () => {
    expect(await errorsFor({ reviewerMaxActiveReviews: 1 })).toEqual([]);
    expect(await errorsFor({ reviewerMaxActiveReviews: null })).toEqual([]);
  });

  it.each(['2026-13-01', '01/12/2026', '2026-12-01T00:00:00Z'])(
    'rejects a return date of %s',
    async (until) => {
      expect(await errorsFor({ reviewerUnavailableUntil: until })).toEqual([
        'reviewerUnavailableUntil',
      ]);
    },
  );

  it('treats an empty return date as open-ended', async () => {
    const dto = plainToInstance(PatchResearcherProfileDto, {
      reviewerUnavailableUntil: '',
    });
    expect(dto.reviewerUnavailableUntil).toBeNull();
    expect(await validate(dto)).toEqual([]);
  });
});
