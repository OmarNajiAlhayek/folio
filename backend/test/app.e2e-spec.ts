import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureNestTestApp } from './configure-nest-test-app';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureNestTestApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Health', () => {
    it('GET /api/v1/health', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .expect((res) => {
          expect((res.body as { status: string }).status).toBe('ok');
        });
    });
  });

  describe('Outbox operational endpoint', () => {
    it('GET /api/v1/health/outbox returns counts without payloads', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/outbox')
        .expect(200)
        .expect((res) => {
          const body = res.body as {
            pending: number;
            dead: number;
            published: number;
            dueNow: number;
            oldestPending: { id: string } | null;
          };
          expect(typeof body.pending).toBe('number');
          expect(typeof body.dead).toBe('number');
          expect(typeof body.published).toBe('number');
          expect(typeof body.dueNow).toBe('number');
          expect(
            body.oldestPending === null ||
              typeof body.oldestPending?.id === 'string',
          ).toBe(true);
        });
    });
  });
});
