/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SearchService } from './search.service';
import { TYPESENSE_CLIENT } from './typesense.client';
import { Submission } from '../entities/submission.entity';
import { Journal } from '../entities/journal.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';

// ── Typesense client mock factory ─────────────────────────────────────────────

function makeMockClient() {
  const mockDocuments = {
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    search: jest.fn().mockResolvedValue({ hits: [], found: 0 }),
  };
  const mockOverrides = {
    retrieve: jest.fn().mockResolvedValue({ overrides: [] }),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  };
  const mockSynonyms = {
    retrieve: jest.fn().mockResolvedValue({ synonyms: [] }),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  };

  // collections(name) returns a collection-level object; collections() with no
  // arg returns the global collections object used by create/retrieve.
  const namedCollection = {
    retrieve: jest.fn().mockResolvedValue({ num_documents: 5 }),
    delete: jest.fn().mockResolvedValue({}),
    documents: jest.fn().mockReturnValue(mockDocuments),
    overrides: jest.fn().mockReturnValue(mockOverrides),
    synonyms: jest.fn().mockReturnValue(mockSynonyms),
  };
  const rootCollections = {
    retrieve: jest.fn().mockRejectedValue(new Error('Not Found')),
    create: jest.fn().mockResolvedValue({}),
  };

  const mockAnalyticsRules = { upsert: jest.fn().mockResolvedValue({}) };
  const mockAnalyticsEvents = { create: jest.fn().mockResolvedValue({}) };

  const client = {
    collections: jest
      .fn()
      .mockImplementation((name?: string) =>
        name ? namedCollection : rootCollections,
      ),
    analytics: {
      rules: jest.fn().mockReturnValue(mockAnalyticsRules),
      events: jest.fn().mockReturnValue(mockAnalyticsEvents),
    },
  };

  return {
    client,
    namedCollection,
    rootCollections,
    mockDocuments,
    mockAnalyticsRules,
    mockAnalyticsEvents,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  const s = new Submission();
  s.id = 'sub-1';
  s.slug = 'test-article';
  s.title = 'Test Article';
  s.titleAr = 'مقالة اختبار';
  s.abstract = 'An abstract.';
  s.abstractAr = 'ملخص.';
  s.keywords = 'test, unit';
  s.keywordsAr = 'اختبار';
  s.disciplines = ['Computer Science'];
  s.articleType = 'original_research' as Submission['articleType'];
  s.status = SubmissionStatus.PUBLISHED;
  s.publishedAt = new Date('2024-01-01');
  s.authorId = 'author-1';
  s.journalId = 'journal-engj';
  return Object.assign(s, overrides);
}

const mockSubmissionsRepo = {
  find: jest.fn().mockResolvedValue([]),
};

/** Nine rows of frozen reference data; the service caches this per process. */
const mockJournalsRepo = {
  find: jest.fn().mockResolvedValue([
    { id: 'journal-engj', slug: 'engj' },
    { id: 'journal-medj', slug: 'medj' },
  ]),
};

function searchServiceProviders(client: unknown) {
  return [
    SearchService,
    { provide: TYPESENSE_CLIENT, useValue: client },
    { provide: 'TYPESENSE_COLLECTION_NAME', useValue: 'publications' },
    { provide: getRepositoryToken(Submission), useValue: mockSubmissionsRepo },
    { provide: getRepositoryToken(Journal), useValue: mockJournalsRepo },
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SearchService', () => {
  let service: SearchService;
  let mocks: ReturnType<typeof makeMockClient>;

  beforeEach(async () => {
    mocks = makeMockClient();

    const moduleRef = await Test.createTestingModule({
      providers: searchServiceProviders(mocks.client),
    }).compile();

    service = moduleRef.get(SearchService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── isEnabled ──────────────────────────────────────────────────────────────

  it('isEnabled returns true when client is provided', () => {
    expect(service.isEnabled()).toBe(true);
  });

  it('isEnabled returns false when client is null', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: searchServiceProviders(null),
    }).compile();
    expect(moduleRef.get(SearchService).isEnabled()).toBe(false);
  });

  // ── ensureCollection ───────────────────────────────────────────────────────

  describe('ensureCollection', () => {
    it('creates the collection when it does not exist', async () => {
      mocks.namedCollection.retrieve.mockRejectedValueOnce(
        new Error('Not Found'),
      );
      await service.ensureCollection();
      expect(mocks.rootCollections.create).toHaveBeenCalledTimes(1);
    });

    it('skips creation when collection already exists', async () => {
      mocks.namedCollection.retrieve.mockResolvedValueOnce({
        num_documents: 0,
      });
      await service.ensureCollection();
      expect(mocks.rootCollections.create).not.toHaveBeenCalled();
    });

    it('is a no-op when disabled', async () => {
      const nullModule = await Test.createTestingModule({
        providers: searchServiceProviders(null),
      }).compile();
      await expect(
        nullModule.get(SearchService).ensureCollection(),
      ).resolves.toBeUndefined();
    });
  });

  // ── upsertDocument ─────────────────────────────────────────────────────────

  describe('upsertDocument', () => {
    it('maps all submission fields into the indexed document', async () => {
      const sub = makeSubmission();
      await service.upsertDocument(sub, 'Jane Doe');
      expect(mocks.mockDocuments.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'sub-1',
          slug: 'test-article',
          title: 'Test Article',
          authorDisplayName: 'Jane Doe',
          disciplines: ['Computer Science'],
          publishedAt: sub.publishedAt!.getTime(),
        }),
      );
    });

    // The index carries the slug, not the id: it is the same public contract
    // the portal URLs and the `?journal=` catalog filter use.
    it('resolves the journal id to its slug', async () => {
      await service.upsertDocument(makeSubmission(), 'Jane Doe');

      expect(mocks.mockDocuments.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ journalSlug: 'engj' }),
      );
    });

    it('indexes an empty slug when the journal row is unknown', async () => {
      await service.upsertDocument(
        makeSubmission({ journalId: 'journal-gone' }),
        'Jane Doe',
      );

      expect(mocks.mockDocuments.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ journalSlug: '' }),
      );
    });

    it('reads the journal table once and caches it for the process', async () => {
      mockJournalsRepo.find.mockClear();

      await service.upsertDocument(makeSubmission(), 'A');
      await service.upsertDocument(makeSubmission({ id: 'sub-2' }), 'B');

      expect(mockJournalsRepo.find).toHaveBeenCalledTimes(1);
    });

    it('falls back to Date.now() when publishedAt is null', async () => {
      const sub = makeSubmission({ publishedAt: null });
      const before = Date.now();
      await service.upsertDocument(sub, '');
      const after = Date.now();
      const doc = mocks.mockDocuments.upsert.mock.calls[0][0] as {
        publishedAt: number;
      };
      expect(doc.publishedAt).toBeGreaterThanOrEqual(before);
      expect(doc.publishedAt).toBeLessThanOrEqual(after);
    });

    it('is a no-op when disabled', async () => {
      const nullModule = await Test.createTestingModule({
        providers: searchServiceProviders(null),
      }).compile();
      await expect(
        nullModule
          .get(SearchService)
          .upsertDocument(makeSubmission(), 'Author'),
      ).resolves.toBeUndefined();
    });
  });

  // ── deleteDocument ─────────────────────────────────────────────────────────

  describe('deleteDocument', () => {
    it('deletes the document by id', async () => {
      await service.deleteDocument('sub-1');
      expect(mocks.namedCollection.documents).toHaveBeenCalledWith('sub-1');
      expect(mocks.mockDocuments.delete).toHaveBeenCalled();
    });

    it('logs a warning on failure without rethrowing', async () => {
      mocks.mockDocuments.delete.mockRejectedValueOnce(
        new Error('Typesense 404'),
      );
      await expect(service.deleteDocument('missing')).resolves.toBeUndefined();
    });
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns enabled:false and collectionReady:false when disabled', async () => {
      const nullModule = await Test.createTestingModule({
        providers: searchServiceProviders(null),
      }).compile();
      const status = await nullModule.get(SearchService).getStatus();
      expect(status).toEqual({ enabled: false, collectionReady: false });
    });

    it('returns document count when collection exists', async () => {
      mocks.namedCollection.retrieve.mockResolvedValueOnce({
        num_documents: 42,
      });
      const status = await service.getStatus();
      expect(status).toEqual({
        enabled: true,
        collectionReady: true,
        documentCount: 42,
      });
    });

    it('returns collectionReady:false when collection does not exist', async () => {
      mocks.namedCollection.retrieve.mockRejectedValueOnce(
        new Error('Not Found'),
      );
      const status = await service.getStatus();
      expect(status).toEqual({ enabled: true, collectionReady: false });
    });
  });

  // ── dropCollection ─────────────────────────────────────────────────────────

  describe('dropCollection', () => {
    it('deletes the collection and resets ready flag', async () => {
      await service.dropCollection();
      expect(mocks.namedCollection.delete).toHaveBeenCalled();
    });

    it('logs a warning on failure without rethrowing', async () => {
      mocks.namedCollection.delete.mockRejectedValueOnce(
        new Error('Already gone'),
      );
      await expect(service.dropCollection()).resolves.toBeUndefined();
    });
  });

  // ── ensureAnalyticsRules ───────────────────────────────────────────────────

  describe('ensureAnalyticsRules', () => {
    it('upserts both popular-queries and nohits-queries rules', async () => {
      await service.ensureAnalyticsRules();
      expect(mocks.mockAnalyticsRules.upsert).toHaveBeenCalledTimes(2);
      const [firstCall, secondCall] =
        mocks.mockAnalyticsRules.upsert.mock.calls;
      expect(firstCall[0]).toContain('popular-queries');
      expect(firstCall[1]).toMatchObject({ type: 'popular_queries' });
      expect(secondCall[0]).toContain('nohits-queries');
      expect(secondCall[1]).toMatchObject({ type: 'nohits_queries' });
    });

    it('does not throw when disabled', async () => {
      const nullModule = await Test.createTestingModule({
        providers: searchServiceProviders(null),
      }).compile();
      await expect(
        nullModule.get(SearchService).ensureAnalyticsRules(),
      ).resolves.toBeUndefined();
    });

    it('logs a warning on failure without rethrowing', async () => {
      mocks.mockAnalyticsRules.upsert.mockRejectedValueOnce(
        new Error('analytics error'),
      );
      await expect(service.ensureAnalyticsRules()).resolves.toBeUndefined();
    });
  });

  // ── recordClickEvent ───────────────────────────────────────────────────────

  describe('recordClickEvent', () => {
    it('sends a click event with the correct fields', async () => {
      await service.recordClickEvent('neural networks', 'doc-42', 'user-xyz');
      expect(mocks.mockAnalyticsEvents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'click',
          data: expect.objectContaining({
            q: 'neural networks',
            doc_id: 'doc-42',
            user_id: 'user-xyz',
          }),
        }),
      );
    });

    it('logs a warning on failure without rethrowing', async () => {
      mocks.mockAnalyticsEvents.create.mockRejectedValueOnce(
        new Error('analytics down'),
      );
      await expect(
        service.recordClickEvent('q', 'id', 'user'),
      ).resolves.toBeUndefined();
    });
  });

  // ── searchAsSubmissions ────────────────────────────────────────────────────

  describe('searchAsSubmissions', () => {
    it('returns empty items and zero total when disabled', async () => {
      const nullModule = await Test.createTestingModule({
        providers: searchServiceProviders(null),
      }).compile();
      const result = await nullModule
        .get(SearchService)
        .searchAsSubmissions({});
      expect(result).toEqual({ items: [], total: 0 });
    });

    it('maps Typesense hits to Submission objects', async () => {
      mocks.mockDocuments.search.mockResolvedValueOnce({
        found: 1,
        hits: [
          {
            document: {
              id: 'sub-1',
              slug: 'test-article',
              title: 'Test Article',
              titleAr: '',
              abstract: 'Abstract',
              abstractAr: '',
              keywords: 'test',
              keywordsAr: '',
              authorDisplayName: 'Jane Doe',
              disciplines: ['CS'],
              articleType: 'original_research',
              publishedAt: 1704067200000,
            },
          },
        ],
      });
      const { items, total } = await service.searchAsSubmissions({ q: 'test' });
      expect(total).toBe(1);
      expect(items[0].slug).toBe('test-article');
      expect(items[0].author.displayName).toBe('Jane Doe');
    });

    it('applies journal filter_by by slug', async () => {
      mocks.mockDocuments.search.mockResolvedValueOnce({ found: 0, hits: [] });
      await service.searchAsSubmissions({ journal: 'engj' });
      const searchCall = mocks.mockDocuments.search.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(searchCall['filter_by']).toContain('journalSlug:="engj"');
    });

    it('applies discipline filter_by', async () => {
      mocks.mockDocuments.search.mockResolvedValueOnce({ found: 0, hits: [] });
      await service.searchAsSubmissions({ discipline: 'Physics' });
      const searchCall = mocks.mockDocuments.search.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(searchCall['filter_by']).toContain('disciplines:="Physics"');
    });

    it('applies articleType filter_by', async () => {
      mocks.mockDocuments.search.mockResolvedValueOnce({ found: 0, hits: [] });
      await service.searchAsSubmissions({ articleType: 'review' });
      const searchCall = mocks.mockDocuments.search.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(searchCall['filter_by']).toContain('articleType:="review"');
    });

    it('applies publishedFrom date filter', async () => {
      mocks.mockDocuments.search.mockResolvedValueOnce({ found: 0, hits: [] });
      const from = new Date('2024-01-01');
      await service.searchAsSubmissions({ publishedFrom: from });
      const searchCall = mocks.mockDocuments.search.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(searchCall['filter_by']).toContain(
        `publishedAt:>=${from.getTime()}`,
      );
    });

    it('uses author-only query_by when only author filter is set', async () => {
      mocks.mockDocuments.search.mockResolvedValueOnce({ found: 0, hits: [] });
      await service.searchAsSubmissions({ author: 'Jane' });
      const searchCall = mocks.mockDocuments.search.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(searchCall['query_by']).toBe('authorDisplayName');
    });

    it('uses wildcard query for browsing without a keyword', async () => {
      mocks.mockDocuments.search.mockResolvedValueOnce({ found: 0, hits: [] });
      await service.searchAsSubmissions({});
      const searchCall = mocks.mockDocuments.search.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(searchCall['q']).toBe('*');
    });
  });

  // ── getAnalytics ───────────────────────────────────────────────────────────

  describe('getAnalytics', () => {
    it('returns empty arrays when disabled', async () => {
      const nullModule = await Test.createTestingModule({
        providers: searchServiceProviders(null),
      }).compile();
      const result = await nullModule.get(SearchService).getAnalytics();
      expect(result).toEqual({ topQueries: [], noResultQueries: [] });
    });

    it('maps popular-queries hits into topQueries', async () => {
      mocks.mockDocuments.search
        .mockResolvedValueOnce({
          hits: [
            { document: { q: 'neural networks', count: 42 } },
            { document: { q: 'climate change', count: 30 } },
          ],
        })
        .mockResolvedValueOnce({ hits: [] });

      const result = await service.getAnalytics();
      expect(result.topQueries).toEqual([
        { q: 'neural networks', count: 42 },
        { q: 'climate change', count: 30 },
      ]);
    });

    it('returns empty topQueries when analytics collection does not exist yet', async () => {
      mocks.mockDocuments.search.mockRejectedValue(
        new Error('Collection not found'),
      );
      const result = await service.getAnalytics();
      expect(result.topQueries).toEqual([]);
      expect(result.noResultQueries).toEqual([]);
    });
  });

  describe('resolvePublicationLabels', () => {
    it('returns published submission id, slug, and title', async () => {
      mockSubmissionsRepo.find.mockResolvedValueOnce([
        { id: 'sub-1', slug: 'test-article', title: 'Test Article' },
      ]);
      const labels = await service.resolvePublicationLabels(['sub-1']);
      expect(labels).toEqual([
        { id: 'sub-1', slug: 'test-article', title: 'Test Article' },
      ]);
    });
  });
});
