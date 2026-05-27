import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ApiExceptionFilter } from '../filters/api-exception.filter';
import { Test, TestingModule } from '@nestjs/testing';
import { Throttle, ThrottlerModule, SkipThrottle } from '@nestjs/throttler';
import request from 'supertest';
import { FolioThrottlerGuard } from './folio-throttler.guard';
import { skipAllThrottles } from '../throttle-profiles';

@Controller('health')
@SkipThrottle(skipAllThrottles())
class TestHealthController {
  @Get()
  ok() {
    return { status: 'ok' };
  }
}

@Controller('public/submissions')
@Throttle({ public: {} })
class TestPublicController {
  @Get()
  list() {
    return [];
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
      { name: 'public', ttl: 60_000, limit: 2 },
      { name: 'upload', ttl: 60_000, limit: 20 },
      { name: 'docx', ttl: 60_000, limit: 10 },
      { name: 'sse', ttl: 60_000, limit: 10 },
      { name: 'login', ttl: 60_000, limit: 10 },
      { name: 'register', ttl: 60_000, limit: 5 },
    ]),
  ],
  controllers: [TestHealthController, TestPublicController],
  providers: [
    FolioThrottlerGuard,
    { provide: APP_GUARD, useExisting: FolioThrottlerGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
class ThrottleTestModule {}

describe('Throttling (integration)', () => {
  let app: Awaited<ReturnType<TestingModule['createNestApplication']>>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [ThrottleTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 429 on public list after public limit', async () => {
    const server = app.getHttpServer();

    for (let i = 0; i < 2; i++) {
      const res = await request(server).get('/api/v1/public/submissions');
      expect(res.status).toBe(200);
    }

    const blocked = await request(server).get('/api/v1/public/submissions');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
  });

  it('never returns 429 on health under heavy polling', async () => {
    const server = app.getHttpServer();

    for (let i = 0; i < 50; i++) {
      const res = await request(server).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    }
  });
});
