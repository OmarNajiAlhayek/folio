/**
 * Opt-in integration: SearchService against a real Typesense instance.
 *
 * Prerequisites — start Typesense locally:
 *   docker run -p 8108:8108 -v /tmp/typesense-data:/data typesense/typesense:26.0 \
 *     --data-dir /data --api-key=xyz --enable-cors
 *
 * Run:
 *   # PowerShell:
 *   $env:TYPESENSE_INTEGRATION='1'; npm test -- --testPathPatterns=search.integration --runInBand
 *   # bash / npm script:
 *   npm run test:typesense
 *
 * Optional env overrides:
 *   TYPESENSE_HOST   (default: localhost)
 *   TYPESENSE_PORT   (default: 8108)
 *   TYPESENSE_API_KEY (default: xyz)
 */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Client } from 'typesense';
import { SearchService } from './search.service';
import { TYPESENSE_CLIENT } from './typesense.client';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SubmissionArticleType } from '../entities/submission-article-type.enum';

const ENABLED = process.env.TYPESENSE_INTEGRATION === '1';

// Connection params — fall back to the docker-run example in .env.example
const HOST = process.env.TYPESENSE_HOST ?? 'localhost';
const PORT = parseInt(process.env.TYPESENSE_PORT ?? '8108', 10);
const API_KEY = process.env.TYPESENSE_API_KEY ?? 'xyz';

// Unique collection per run so parallel CI invocations don't collide and a
// failed cleanup in a previous run doesn't affect this one.
const COLLECTION = `publications_test_${Date.now()}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClient(): Client {
  return new Client({
    nodes: [{ host: HOST, port: PORT, protocol: 'http' }],
    apiKey: API_KEY,
    connectionTimeoutSeconds: 5,
    retryIntervalSeconds: 0.5,
    numRetries: 3,
  });
}

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  const s = new Submission();
  s.id = crypto.randomUUID();
  s.slug = 'test-article';
  s.title = 'Neural Networks in Climate Modelling';
  s.titleAr = 'الشبكات العصبية في نمذجة المناخ';
  s.abstract = 'A study of deep learning applied to climate prediction.';
  s.abstractAr = 'دراسة التعلم العميق في التنبؤ بالمناخ.';
  s.keywords = 'neural networks, climate, deep learning';
  s.keywordsAr = 'شبكات عصبية, مناخ';
  s.disciplines = ['Computer Science'];
  s.articleType = SubmissionArticleType.ORIGINAL_RESEARCH;
  s.status = SubmissionStatus.PUBLISHED;
  s.publishedAt = new Date('2024-06-15');
  s.authorId = 'author-1';
  return Object.assign(s, overrides);
}

// ── Test suite ────────────────────────────────────────────────────────────────

(ENABLED ? describe : describe.skip)(
  'SearchService (Typesense integration)',
  () => {
    let service: SearchService;
    let client: Client;

    beforeAll(async () => {
      client = makeClient();

      const moduleRef = await Test.createTestingModule({
        providers: [
          SearchService,
          { provide: TYPESENSE_CLIENT, useValue: client },
          { provide: 'TYPESENSE_COLLECTION_NAME', useValue: COLLECTION },
          {
            provide: getRepositoryToken(Submission),
            useValue: { find: jest.fn().mockResolvedValue([]) },
          },
        ],
      }).compile();

      service = moduleRef.get(SearchService);
      await service.ensureCollection();
    });

    afterAll(async () => {
      try {
        await client.collections(COLLECTION).delete();
      } catch {
        // best-effort; collection may already be gone
      }
    });

    // ── isEnabled ─────────────────────────────────────────────────────────────

    it('isEnabled returns true when a real client is provided', () => {
      expect(service.isEnabled()).toBe(true);
    });

    // ── Collection management ─────────────────────────────────────────────────

    describe('collection management', () => {
      it('collection is ready and empty after ensureCollection', async () => {
        const status = await service.getStatus();
        expect(status).toMatchObject({
          enabled: true,
          collectionReady: true,
          documentCount: 0,
        });
      });

      it('ensureCollection is idempotent (second call does not throw or re-create)', async () => {
        await expect(service.ensureCollection()).resolves.toBeUndefined();
        const status = await service.getStatus();
        expect(status.collectionReady).toBe(true);
      });
    });

    // ── Document lifecycle ────────────────────────────────────────────────────

    describe('document lifecycle', () => {
      let submissionId: string;

      beforeAll(async () => {
        submissionId = crypto.randomUUID();
        await service.upsertDocument(
          makeSubmission({ id: submissionId }),
          'Jane Doe',
        );
      });

      it('document count increases after upsert', async () => {
        const status = await service.getStatus();
        expect(status.documentCount).toBeGreaterThanOrEqual(1);
      });

      it('upserted document appears in wildcard search', async () => {
        const { items, total } = await service.searchAsSubmissions({});
        expect(total).toBeGreaterThanOrEqual(1);
        const found = items.find((i) => i.id === submissionId);
        expect(found).toBeDefined();
        expect(found!.title).toBe('Neural Networks in Climate Modelling');
        expect(found!.author.displayName).toBe('Jane Doe');
        expect(found!.publishedAt).toEqual(new Date('2024-06-15'));
      });

      it('upsert is idempotent — overwrites the existing document with new title', async () => {
        await service.upsertDocument(
          makeSubmission({ id: submissionId, title: 'Updated Title' }),
          'Jane Doe',
        );
        const { items } = await service.searchAsSubmissions({});
        const found = items.find((i) => i.id === submissionId);
        expect(found?.title).toBe('Updated Title');
      });

      it('deletes document by id — collection returns to 0', async () => {
        await service.deleteDocument(submissionId);
        const status = await service.getStatus();
        expect(status.documentCount).toBe(0);
      });

      it('deleteDocument on a non-existent id does not throw', async () => {
        await expect(
          service.deleteDocument('id-that-does-not-exist'),
        ).resolves.toBeUndefined();
      });
    });

    // ── Full-text search ──────────────────────────────────────────────────────

    describe('searchAsSubmissions', () => {
      const docA = crypto.randomUUID(); // Physics / 2023
      const docB = crypto.randomUUID(); // Medicine / 2024-06
      const docC = crypto.randomUUID(); // Economics / 2024-12

      beforeAll(async () => {
        await Promise.all([
          service.upsertDocument(
            makeSubmission({
              id: docA,
              title: 'Quantum Computing in Cryptography',
              titleAr: 'الحوسبة الكمومية في التشفير',
              abstract: 'How qubits break classical ciphers.',
              keywords: 'quantum, cryptography, qubits',
              disciplines: ['Physics'],
              articleType: SubmissionArticleType.ORIGINAL_RESEARCH,
              publishedAt: new Date('2023-01-15'),
            }),
            'Alice Smith',
          ),
          service.upsertDocument(
            makeSubmission({
              id: docB,
              title: 'Machine Learning for Medical Imaging',
              titleAr: 'التعلم الآلي في التصوير الطبي',
              abstract: 'CNNs applied to radiology scans.',
              keywords: 'machine learning, imaging, radiology',
              disciplines: ['Medicine'],
              articleType: SubmissionArticleType.REVIEW_ARTICLE,
              publishedAt: new Date('2024-06-01'),
            }),
            'Bob Researcher',
          ),
          service.upsertDocument(
            makeSubmission({
              id: docC,
              title: 'Climate Change Economic Impact Analysis',
              titleAr: 'التحليل الاقتصادي لتأثير تغير المناخ',
              abstract: 'Macro-level cost of rising temperatures.',
              keywords: 'climate, economics, carbon',
              disciplines: ['Economics'],
              articleType: SubmissionArticleType.ORIGINAL_RESEARCH,
              publishedAt: new Date('2024-12-01'),
            }),
            'Carol Jones',
          ),
        ]);
      });

      afterAll(async () => {
        await Promise.all([
          service.deleteDocument(docA),
          service.deleteDocument(docB),
          service.deleteDocument(docC),
        ]);
      });

      it('keyword search finds document by title term', async () => {
        const { items, total } = await service.searchAsSubmissions({
          q: 'Quantum',
        });
        expect(total).toBeGreaterThanOrEqual(1);
        expect(items.find((i) => i.id === docA)).toBeDefined();
      });

      it('keyword search finds document by keyword field', async () => {
        const { items } = await service.searchAsSubmissions({
          q: 'cryptography',
        });
        expect(items.find((i) => i.id === docA)).toBeDefined();
      });

      it('fuzzy search with 1 typo still returns the correct document', async () => {
        // 'Quatum' → 'Quantum' — 1 typo on a 6-char token (min_len_1typo = 4)
        const { items } = await service.searchAsSubmissions({
          q: 'Quatum Computing',
        });
        expect(items.find((i) => i.id === docA)).toBeDefined();
      });

      it('wildcard query returns all documents sorted newest-first', async () => {
        const { items, total } = await service.searchAsSubmissions({});
        expect(total).toBeGreaterThanOrEqual(3);
        for (let i = 1; i < items.length; i++) {
          expect(items[i - 1].publishedAt!.getTime()).toBeGreaterThanOrEqual(
            items[i].publishedAt!.getTime(),
          );
        }
      });

      it('filters by discipline — only Physics results returned', async () => {
        const { items } = await service.searchAsSubmissions({
          discipline: 'Physics',
        });
        expect(items.length).toBeGreaterThanOrEqual(1);
        expect(items.every((i) => i.disciplines?.includes('Physics'))).toBe(
          true,
        );
        expect(items.find((i) => i.id === docA)).toBeDefined();
        expect(items.find((i) => i.id === docB)).toBeUndefined();
      });

      it('filters by articleType — only review_article results returned', async () => {
        const { items } = await service.searchAsSubmissions({
          articleType: SubmissionArticleType.REVIEW_ARTICLE,
        });
        expect(items.length).toBeGreaterThanOrEqual(1);
        expect(
          items.every(
            (i) => i.articleType === SubmissionArticleType.REVIEW_ARTICLE,
          ),
        ).toBe(true);
        expect(items.find((i) => i.id === docB)).toBeDefined();
        expect(items.find((i) => i.id === docA)).toBeUndefined();
      });

      it('filters by publishedFrom — excludes older documents', async () => {
        // 2023-01-15 (docA) should be excluded; 2024-06-01 (docB) and 2024-12-01 (docC) included
        const from = new Date('2024-01-01');
        const { items } = await service.searchAsSubmissions({
          publishedFrom: from,
        });
        expect(items.find((i) => i.id === docA)).toBeUndefined();
        expect(items.find((i) => i.id === docB)).toBeDefined();
        expect(items.find((i) => i.id === docC)).toBeDefined();
      });

      it('filters by publishedTo — excludes newer documents', async () => {
        // Only docA (2023-01-15) is before 2023-12-31
        const to = new Date('2023-12-31');
        const { items } = await service.searchAsSubmissions({
          publishedTo: to,
        });
        expect(items.find((i) => i.id === docA)).toBeDefined();
        expect(items.find((i) => i.id === docB)).toBeUndefined();
        expect(items.find((i) => i.id === docC)).toBeUndefined();
      });

      it('combined publishedFrom + publishedTo range filter', async () => {
        const { items } = await service.searchAsSubmissions({
          publishedFrom: new Date('2024-01-01'),
          publishedTo: new Date('2024-07-01'),
        });
        // Only docB falls in [2024-01-01, 2024-07-01]
        expect(items.find((i) => i.id === docB)).toBeDefined();
        expect(items.find((i) => i.id === docA)).toBeUndefined();
        expect(items.find((i) => i.id === docC)).toBeUndefined();
      });

      it('author-only search restricts query_by to authorDisplayName', async () => {
        const { items } = await service.searchAsSubmissions({
          author: 'Alice',
        });
        // Alice Smith is the author of docA
        expect(items.find((i) => i.id === docA)).toBeDefined();
        // docB (Bob Researcher) should not appear
        expect(items.find((i) => i.id === docB)).toBeUndefined();
      });

      it('combined keyword + author search returns only matching documents', async () => {
        const { items } = await service.searchAsSubmissions({
          q: 'Machine Learning',
          author: 'Bob',
        });
        expect(items.find((i) => i.id === docB)).toBeDefined();
      });

      it('paginates results — page 1 and page 2 have no overlapping ids', async () => {
        const page1 = await service.searchAsSubmissions(
          {},
          { limit: 2, offset: 0 },
        );
        const page2 = await service.searchAsSubmissions(
          {},
          { limit: 2, offset: 2 },
        );
        expect(page1.items.length).toBeLessThanOrEqual(2);
        if (page1.total > 2) {
          const ids1 = new Set(page1.items.map((i) => i.id));
          expect(page2.items.every((i) => !ids1.has(i.id))).toBe(true);
        }
      });

      it('returns total=0 and empty items for a query with no matches', async () => {
        const { total, items } = await service.searchAsSubmissions({
          q: 'xyzzy_no_such_term_in_collection_ever',
        });
        expect(total).toBe(0);
        expect(items).toHaveLength(0);
      });

      it('hits include all mapped Submission fields', async () => {
        const { items } = await service.searchAsSubmissions({ q: 'Quantum' });
        const doc = items.find((i) => i.id === docA);
        expect(doc).toBeDefined();
        expect(doc!.slug).toBe('test-article');
        expect(doc!.disciplines).toEqual(['Physics']);
        expect(doc!.articleType).toBe(SubmissionArticleType.ORIGINAL_RESEARCH);
        expect(doc!.publishedAt).toEqual(new Date('2023-01-15'));
        expect(doc!.author.displayName).toBe('Alice Smith');
      });
    });

    // ── Overrides ─────────────────────────────────────────────────────────────

    describe('overrides', () => {
      const overrideId = `test-override-${Date.now()}`;

      afterAll(async () => {
        try {
          await service.deleteOverride(overrideId);
        } catch {
          // already deleted by the delete test
        }
      });

      it('getOverrides returns an array (empty initially)', async () => {
        const overrides = await service.getOverrides();
        expect(Array.isArray(overrides)).toBe(true);
      });

      it('upsertOverride creates a rule and returns it with the given id', async () => {
        const result = await service.upsertOverride(overrideId, {
          rule: { query: 'quantum', match: 'exact' },
          includes: [],
          excludes: [],
        });
        expect(result).toMatchObject({ id: overrideId });
      });

      it('getOverrides lists the created override', async () => {
        const overrides = await service.getOverrides();
        const found = overrides.find(
          (o: { id: string }) => o.id === overrideId,
        );
        expect(found).toBeDefined();
      });

      it('upsertOverride updates an existing rule (idempotent)', async () => {
        const result = await service.upsertOverride(overrideId, {
          rule: { query: 'quantum computing', match: 'contains' },
          includes: [],
          excludes: [],
        });
        expect(result).toMatchObject({ id: overrideId });
      });

      it('deleteOverride removes the rule', async () => {
        await service.deleteOverride(overrideId);
        const overrides = await service.getOverrides();
        expect(
          overrides.find((o: { id: string }) => o.id === overrideId),
        ).toBeUndefined();
      });
    });

    // ── Synonyms ──────────────────────────────────────────────────────────────

    describe('synonyms', () => {
      const synonymId = `test-synonym-${Date.now()}`;

      afterAll(async () => {
        try {
          await service.deleteSynonym(synonymId);
        } catch {
          // already deleted by the delete test
        }
      });

      it('getSynonyms returns an array initially', async () => {
        const synonyms = await service.getSynonyms();
        expect(Array.isArray(synonyms)).toBe(true);
      });

      it('upsertSynonym creates a multi-way synonym and returns it with the given id', async () => {
        const result = await service.upsertSynonym(synonymId, {
          synonyms: ['machine learning', 'ml', 'artificial intelligence'],
        });
        expect(result).toMatchObject({ id: synonymId });
      });

      it('getSynonyms lists the created synonym', async () => {
        const synonyms = await service.getSynonyms();
        const found = synonyms.find((s: { id: string }) => s.id === synonymId);
        expect(found).toBeDefined();
      });

      it('upsertSynonym updates an existing synonym (idempotent)', async () => {
        const result = await service.upsertSynonym(synonymId, {
          synonyms: [
            'machine learning',
            'ml',
            'deep learning',
            'neural networks',
          ],
        });
        expect(result).toMatchObject({ id: synonymId });
      });

      it('upsertSynonym creates a one-way synonym with root', async () => {
        const oneWayId = `${synonymId}-oneway`;
        // TypeScript resolves Omit<TypesenseSynonymMulti | TypesenseSynonymOneWay, 'id'>
        // to just { synonyms: string[] } (the intersection), dropping 'root'. The service
        // passes the body through unchanged at runtime, so we cast through unknown.
        const body = {
          root: 'ai',
          synonyms: ['artificial intelligence', 'machine learning'],
        };
        try {
          const result = await service.upsertSynonym(
            oneWayId,
            body as unknown as Parameters<typeof service.upsertSynonym>[1],
          );
          expect(result).toMatchObject({ id: oneWayId });
        } finally {
          try {
            await service.deleteSynonym(oneWayId);
          } catch {
            // best-effort cleanup
          }
        }
      });

      it('deleteSynonym removes the rule', async () => {
        await service.deleteSynonym(synonymId);
        const synonyms = await service.getSynonyms();
        expect(
          synonyms.find((s: { id: string }) => s.id === synonymId),
        ).toBeUndefined();
      });
    });

    // ── Analytics rules ───────────────────────────────────────────────────────

    describe('analytics rules', () => {
      it('ensureAnalyticsRules does not throw on a fresh collection', async () => {
        await expect(service.ensureAnalyticsRules()).resolves.toBeUndefined();
      });

      it('ensureAnalyticsRules is idempotent (second call succeeds)', async () => {
        await expect(service.ensureAnalyticsRules()).resolves.toBeUndefined();
      });

      it('getAnalytics returns topQueries and noResultQueries arrays', async () => {
        const result = await service.getAnalytics();
        expect(Array.isArray(result.topQueries)).toBe(true);
        expect(Array.isArray(result.noResultQueries)).toBe(true);
      });
    });

    // ── recordClickEvent ──────────────────────────────────────────────────────

    describe('recordClickEvent', () => {
      it('does not throw when called with valid params', async () => {
        await expect(
          service.recordClickEvent('quantum', crypto.randomUUID(), 'user-test'),
        ).resolves.toBeUndefined();
      });
    });

    // ── dropCollection and re-create ──────────────────────────────────────────

    describe('dropCollection', () => {
      it('drops the collection — getStatus reports collectionReady:false', async () => {
        await service.dropCollection();
        const status = await service.getStatus();
        expect(status.enabled).toBe(true);
        expect(status.collectionReady).toBe(false);
      });

      it('dropCollection again does not throw (graceful no-op)', async () => {
        await expect(service.dropCollection()).resolves.toBeUndefined();
      });

      it('ensureCollection recreates the collection successfully', async () => {
        await service.ensureCollection();
        const status = await service.getStatus();
        expect(status.collectionReady).toBe(true);
        expect(status.documentCount).toBe(0);
      });
    });
  },
);
