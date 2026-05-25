import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('Auth logout revocation (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(() => {
    process.env.AUTH_RETURN_BEARER = 'true';
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('revokes the current JWT on logout so reuse returns 401', async () => {
    const email = `logout-e2e-${Date.now()}@folio.local`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        displayName: 'Logout E2E',
      })
      .expect(201);

    const body = registerRes.body as {
      accessToken: string;
      csrfToken: string;
    };
    expect(body.accessToken).toBeDefined();
    expect(body.csrfToken).toBeDefined();

    const savedToken = body.accessToken;

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${savedToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${savedToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${savedToken}`)
      .expect(401);
  });

  it('second login keeps the first session valid until that token is revoked', async () => {
    const email = `multi-session-${Date.now()}@folio.local`;
    const password = 'TestPass123!';

    const first = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, displayName: 'Multi Session' })
      .expect(201);
    const tokenA = (first.body as { accessToken: string }).accessToken;

    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    const tokenB = (second.body as { accessToken: string }).accessToken;

    expect(tokenA).not.toBe(tokenB);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
  });
});
