import { NotificationsService } from './notifications.service';

/** Jest provider for SubmissionsService / UsersService unit tests. */
export const notificationsServiceMock = {
  provide: NotificationsService,
  useValue: {
    createIfAbsent: jest.fn().mockResolvedValue(null),
    createManyIfAbsent: jest.fn().mockResolvedValue([]),
    emitCreated: jest.fn(),
  },
};
