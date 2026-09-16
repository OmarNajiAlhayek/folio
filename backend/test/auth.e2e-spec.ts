import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureNestTestApp } from './configure-nest-test-app';
import {
  FOLIO_ACCESS_COOKIE,
  FOLIO_REFRESH_COOKIE,
} from '../src/auth/auth-cookie.util';
import { encodeOAuthState } from '../src/auth/oauth-state.util';
import { orcidCheckCharacter } from '../src/auth/orcid-id.util';
import { OutboundEvent } from '../src/entities/outbound-event.entity';
import { ROUTING_KEY } from '@folio/shared/contracts/email-events';

function extractCookie(
  setCookie: string | string[] | undefined,
  name: string,
): string | undefined {
  const list = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  const hit = list.find((c) => c.startsWith(`${name}=`));
  if (!hit) return undefined;
  return hit.split(';')[0]?.split('=').slice(1).join('=');
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) {
    throw new Error('invalid JWT');
  }
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

/** A fresh ORCID iD with a valid check digit: registration requires one, unique per account. */
function testOrcid(): string {
  const digits = Array.from({ length: 15 }, () =>
    Math.floor(Math.random() * 10),
  ).join('');
  const full = `${digits}${orcidCheckCharacter(digits)}`;
  return (full.match(/.{4}/g) ?? []).join('-');
}

async function latestOutboxOtp(
  outboxRepo: Repository<OutboundEvent>,
): Promise<string> {
  const row = await outboxRepo.findOne({
    where: { routingKey: ROUTING_KEY.authVerificationOtp },
    order: { createdAt: 'DESC' },
  });
  const code = row?.payload?.otpCode;
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    throw new Error('verification OTP not found in outbox');
  }
  return code;
}

async function latestResetToken(
  outboxRepo: Repository<OutboundEvent>,
): Promise<string> {
  const row = await outboxRepo.findOne({
    where: { routingKey: ROUTING_KEY.authPasswordReset },
    order: { createdAt: 'DESC' },
  });
  const resetUrl = row?.payload?.resetUrl;
  if (typeof resetUrl !== 'string') {
    throw new Error('reset URL not found in outbox');
  }
  const url = new URL(resetUrl);
  const token = url.searchParams.get('token');
  if (!token) {
    throw new Error('reset token missing from outbox URL');
  }
  return token;
}

describe('Auth sessions (e2e)', () => {
  let app: INestApplication<App>;
  let outboxRepo: Repository<OutboundEvent>;

  beforeAll(() => {
    process.env.AUTH_RETURN_BEARER = 'true';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.REFRESH_EXPIRES_IN = '30d';
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureNestTestApp(app);
    app.use(cookieParser());
    await app.init();
    outboxRepo = app.get(getRepositoryToken(OutboundEvent));
  });

  afterEach(async () => {
    await app.close();
  });

  it('issues access tokens with embedded RBAC claims', async () => {
    const email = `rbac-claims-${Date.now()}@folio.local`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        displayName: 'RBAC Claims E2E',
        orcid: testOrcid(),
      })
      .expect(201);

    const { accessToken } = registerRes.body as { accessToken: string };
    const payload = decodeJwtPayload(accessToken);
    expect(payload.sub).toBeDefined();
    expect(payload.jti).toBeDefined();
    expect(payload.roleSlugs).toEqual(expect.arrayContaining(['author']));
    expect(payload.permissionSlugs).toEqual(
      expect.arrayContaining(['submission.manage_own']),
    );

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('revokes the current JWT on logout so reuse returns 401', async () => {
    const email = `logout-e2e-${Date.now()}@folio.local`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        displayName: 'Logout E2E',
        orcid: testOrcid(),
      })
      .expect(201);

    const body = registerRes.body as {
      accessToken: string;
      refreshToken: string;
      csrfToken: string;
    };
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.csrfToken).toBeDefined();

    const savedToken = body.accessToken;

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${savedToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${savedToken}`)
      .send({ refreshToken: body.refreshToken })
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
      .send({
        email,
        password,
        displayName: 'Multi Session',
        orcid: testOrcid(),
      })
      .expect(201);
    const tokenA = (first.body as { accessToken: string; refreshToken: string })
      .accessToken;
    const refreshA = (first.body as { refreshToken: string }).refreshToken;

    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const tokenB = (second.body as { accessToken: string }).accessToken;

    expect(tokenA).not.toBe(tokenB);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ refreshToken: refreshA })
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

  it('refreshes access token using refresh cookie', async () => {
    const email = `refresh-e2e-${Date.now()}@folio.local`;
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        displayName: 'Refresh E2E',
        orcid: testOrcid(),
      })
      .expect(201);

    const accessCookie = extractCookie(
      loginRes.headers['set-cookie'],
      FOLIO_ACCESS_COOKIE,
    );
    const refreshCookie = extractCookie(
      loginRes.headers['set-cookie'],
      FOLIO_REFRESH_COOKIE,
    );
    expect(accessCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`${FOLIO_REFRESH_COOKIE}=${refreshCookie}`])
      .expect(201);

    const newAccessCookie = extractCookie(
      refreshRes.headers['set-cookie'],
      FOLIO_ACCESS_COOKIE,
    );
    expect(newAccessCookie).toBeDefined();
    expect(newAccessCookie).not.toBe(accessCookie);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', [`${FOLIO_ACCESS_COOKIE}=${newAccessCookie}`])
      .expect(200);
  });

  it('registers unverified, verifies email via OTP from outbox, then marks verified', async () => {
    const email = `verify-e2e-${Date.now()}@folio.local`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        displayName: 'Verify E2E',
        orcid: testOrcid(),
      })
      .expect(201);

    const body = registerRes.body as {
      accessToken: string;
      user: { emailVerified: boolean };
    };
    expect(body.user.emailVerified).toBe(false);

    const otp = await latestOutboxOtp(outboxRepo);

    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({ code: otp })
      .expect(201);

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);

    expect((me.body as { emailVerified: boolean }).emailVerified).toBe(true);

    const welcomeRow = await outboxRepo.findOne({
      where: { routingKey: ROUTING_KEY.authRegistrationWelcome },
      order: { createdAt: 'DESC' },
    });
    expect(welcomeRow?.payload?.type).toBe('AuthRegistrationWelcome');
    expect(welcomeRow?.payload?.user?.email).toBe(email);
  });

  it('forgot-password flow resets password and revokes prior refresh token', async () => {
    const email = `reset-e2e-${Date.now()}@folio.local`;
    const password = 'TestPass123!';
    const newPassword = 'NewPass456!';

    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, displayName: 'Reset E2E', orcid: testOrcid() })
      .expect(201);
    const refreshToken = (registerRes.body as { refreshToken: string })
      .refreshToken;

    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email })
      .expect(200);

    const token = await latestResetToken(outboxRepo);

    await request(app.getHttpServer())
      .get(
        `/api/v1/auth/reset-password/validate?token=${encodeURIComponent(token)}`,
      )
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token, password: newPassword })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: newPassword })
      .expect(200);
  });

  it('revokes the refresh token family when a rotated token is reused', async () => {
    const email = `reuse-e2e-${Date.now()}@folio.local`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        displayName: 'Reuse E2E',
        orcid: testOrcid(),
      })
      .expect(201);

    const originalRefresh = (registerRes.body as { refreshToken: string })
      .refreshToken;

    const rotatedRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: originalRefresh })
      .expect(201);
    const rotatedRefresh = (rotatedRes.body as { refreshToken: string })
      .refreshToken;
    expect(rotatedRefresh).not.toBe(originalRefresh);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: originalRefresh })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotatedRefresh })
      .expect(401);
  });

  it('revoke-others keeps the current session and ends the other', async () => {
    const email = `revoke-others-${Date.now()}@folio.local`;
    const password = 'TestPass123!';

    const first = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, displayName: 'Device A', orcid: testOrcid() })
      .expect(201);
    const tokenA = (first.body as { accessToken: string; refreshToken: string })
      .accessToken;
    const refreshA = (first.body as { refreshToken: string }).refreshToken;

    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const tokenB = (
      second.body as { accessToken: string; refreshToken: string }
    ).accessToken;
    const refreshB = (second.body as { refreshToken: string }).refreshToken;

    await request(app.getHttpServer())
      .post('/api/v1/auth/sessions/revoke-others')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ refreshToken: refreshB })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refreshA })
      .expect(401);
  });
});

describe('ORCID OAuth (e2e, mock)', () => {
  let app: INestApplication<App>;

  beforeAll(() => {
    process.env.ORCID_ENABLED = 'true';
    process.env.ORCID_MOCK_ENABLED = 'true';
    process.env.ORCID_CLIENT_ID = 'APP-TEST';
    process.env.ORCID_CLIENT_SECRET = 'test-secret';
    process.env.AUTH_RETURN_BEARER = 'true';
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureNestTestApp(app);
    app.use(cookieParser());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function loginState() {
    return encodeOAuthState(
      { mode: 'login', locale: 'en' },
      process.env.JWT_SECRET ?? 'change_this_to_a_long_random_secret',
    );
  }

  it('creates a session for a new ORCID user via callback', async () => {
    const state = loginState();
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/auth/orcid/callback?code=mock-new-user&state=${encodeURIComponent(state)}`,
      )
      .expect(302);

    expect(res.headers.location).toMatch(/\/en\/dashboard$/);
    const setCookie = res.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie)
      ? setCookie.join(';')
      : (setCookie ?? '');
    expect(cookieHeader).toContain(`${FOLIO_ACCESS_COOKIE}=`);
  });

  it('redirects to login when ORCID email conflicts with an existing account', async () => {
    const email = `orcid-conflict-${Date.now()}@folio.local`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'TestPass123!',
        displayName: 'Conflict Seed',
        orcid: testOrcid(),
      })
      .expect(201);

    process.env.ORCID_MOCK_EMAIL_CONFLICT = email;
    const state = loginState();
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/auth/orcid/callback?code=mock-email-conflict&state=${encodeURIComponent(state)}`,
      )
      .expect(302);

    expect(res.headers.location).toContain('orcid_error=ORCID_EMAIL_EXISTS');
    delete process.env.ORCID_MOCK_EMAIL_CONFLICT;
  });

  it('rejects password login for ORCID-only accounts', async () => {
    const state = loginState();
    const callback = await request(app.getHttpServer())
      .get(
        `/api/v1/auth/orcid/callback?code=mock-new-user&state=${encodeURIComponent(state)}`,
      )
      .expect(302);
    const cookies = callback.headers['set-cookie'];
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookies)
      .expect(200);
    const email = (meRes.body as { email: string }).email;

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'AnyPassword1!' })
      .expect(401);
  });
});
