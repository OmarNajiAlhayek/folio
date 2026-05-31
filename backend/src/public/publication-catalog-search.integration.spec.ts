/**
 * Opt-in integration: publication catalog FTS + trigram search.
 *
 * Requires Postgres (same `DB_*` as backend `.env`) and search columns:
 *
 *   cd backend
 *   npm run seed
 *   # PowerShell: $env:PUBLICATION_SEARCH_INTEGRATION='1'
 *   npm run test:integration -- --testPathPatterns=publication-catalog-search
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { ensurePublicationSearchSchema } from '../common/ensure-publication-search-schema';

const ENABLED = process.env.PUBLICATION_SEARCH_INTEGRATION === '1';

(ENABLED ? describe : describe.skip)(
  'Publication catalog search (integration)',
  () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      app.setGlobalPrefix('api/v1');
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();

      const dataSource = app.get(DataSource);
      await ensurePublicationSearchSchema(dataSource);
    });

    afterAll(async () => {
      await app?.close();
    });

    it('lists published catalog without filters', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/public/submissions')
        .expect(200);
      expect(res.body).toMatchObject({
        items: expect.any(Array),
        total: expect.any(Number),
        limit: expect.any(Number),
        offset: 0,
      });
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.total).toBeGreaterThanOrEqual(res.body.items.length);
    });

    it('paginates keyword catalog with limit and offset', async () => {
      const first = await request(app.getHttpServer())
        .get('/api/v1/public/submissions')
        .query({ limit: 1, offset: 0 })
        .expect(200);
      expect(first.body.items).toHaveLength(1);
      expect(first.body.limit).toBe(1);
      if (first.body.total > 1) {
        const second = await request(app.getHttpServer())
          .get('/api/v1/public/submissions')
          .query({ limit: 1, offset: 1 })
          .expect(200);
        expect(second.body.items).toHaveLength(1);
        expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
      }
    });

    it('finds sample by quick search q', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/public/submissions')
        .query({ q: '[SAMPLE]' })
        .expect(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      for (const row of res.body.items as { title: string }[]) {
        expect(row.title).toContain('[SAMPLE]');
      }
    });

    it('filters by advanced author', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/public/submissions')
        .query({ author: 'Researcher' })
        .expect(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      for (const row of res.body.items as {
        author?: { displayName: string };
      }[]) {
        expect(row.author?.displayName).toMatch(/Researcher/i);
      }
    });

    it('returns author suggestions for partial names', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/public/submissions/author-suggestions')
        .query({ q: 'Resear' })
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      for (const row of res.body as { displayName: string }[]) {
        expect(row.displayName).toMatch(/Resear/i);
      }
    });

    it('rejects author suggestions shorter than 2 characters', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/public/submissions/author-suggestions')
        .query({ q: 'R' })
        .expect(400);
    });

    it('filters by articleType', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/public/submissions')
        .query({ articleType: 'original_research' })
        .expect(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      for (const row of res.body.items as { articleType?: string }[]) {
        expect(row.articleType).toBe('original_research');
      }
    });

    it('rejects invalid discipline with 400', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/public/submissions')
        .query({ discipline: 'not-a-real-label' })
        .expect(400);
    });

    it('rejects publishedFrom after publishedTo', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/public/submissions')
        .query({
          publishedFrom: '2026-12-01',
          publishedTo: '2020-01-01',
        })
        .expect(400);
    });
  },
);
