import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationHub } from './notification-hub';
import { Notification } from '../entities/notification.entity';
import { NOTIFICATION_TYPE } from './notification-types';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let hub: { emitNotification: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 'n-1', createdAt: new Date() })),
      count: jest.fn().mockResolvedValue(2),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };
    hub = { emitNotification: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: repo },
        { provide: NotificationHub, useValue: hub },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  it('createIfAbsent returns null when idempotency key exists', async () => {
    repo.findOne.mockResolvedValue({ id: 'existing' });
    const result = await service.createIfAbsent({
      userId: 'u1',
      type: NOTIFICATION_TYPE.REVIEWER_INVITED,
      href: '/assignments',
      idempotencyKey: 'reviewer_invited:a1',
    });
    expect(result).toBeNull();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('emitCreated pushes to hub', () => {
    const row = {
      id: 'n-1',
      userId: 'u1',
      type: NOTIFICATION_TYPE.REVIEWER_INVITED,
      titleKey: 'Notifications.reviewerInvited.title',
      bodyKey: 'Notifications.reviewerInvited.body',
      params: {},
      href: '/assignments',
      idempotencyKey: 'k1',
      readAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    } as Notification;
    service.emitCreated([row]);
    expect(hub.emitNotification).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ id: 'n-1' }),
    );
  });

  it('unreadCount queries unread rows', async () => {
    await service.unreadCount('u1');
    expect(repo.count).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: expect.anything() },
    });
  });
});
