/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SearchSyncService } from './search-sync.service';
import { SearchService } from './search.service';
import { Submission } from '../entities/submission.entity';
import { User } from '../entities/user.entity';
import { SearchSyncCheckpoint } from './search-sync-checkpoint.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';

describe('SearchSyncService', () => {
  let service: SearchSyncService;
  const findMock = jest.fn();
  const upsertMock = jest.fn().mockResolvedValue(undefined);
  const deleteMock = jest.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    findMock.mockReset();
    upsertMock.mockClear();
    deleteMock.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchSyncService,
        {
          provide: SearchService,
          useValue: {
            isEnabled: () => true,
            ensureCollection: jest.fn(),
            ensureAnalyticsRules: jest.fn(),
            upsertDocument: upsertMock,
            deleteDocument: deleteMock,
          },
        },
        {
          provide: getRepositoryToken(Submission),
          useValue: { find: findMock },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findBy: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(SearchSyncCheckpoint),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(SearchSyncService);
    await service.onModuleInit();
  });

  it('catchUpSync queries published rows updated after checkpoint', async () => {
    findMock
      .mockResolvedValueOnce([
        { id: 's1', authorId: 'a1', updatedAt: new Date() },
      ])
      .mockResolvedValueOnce([]);

    await service.catchUpSync();

    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: SubmissionStatus.PUBLISHED,
          updatedAt: expect.anything(),
        }),
      }),
    );
    expect(upsertMock).toHaveBeenCalled();
  });
});
