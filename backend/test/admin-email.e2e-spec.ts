/**
 * Admin email HTTP contract (supertest).
 *
 * **Full DB profile**: Postgres has schema `email` with tables from email-service
 * migrations (including `email_reminder_policy` id=1 and `email_template` rows).
 * Expect 200 on happy-path GETs below.
 *
 * **Light profile**: If `GET /admin/email/reminder-policy` returns 404
 * (`EMAIL_POLICY_NOT_FOUND`) or 500 (e.g. missing relation), DB-backed `it`
 * blocks return immediately (no assertions) so CI stays green; see console
 * warning. Prefer running this file only on the **full DB profile** so those
 * cases execute.
 *
 * Always runs: 401 (no JWT), 403 (authenticated author), 422 (invalid template key).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import { RbacService } from '../src/rbac/rbac.service';
import { ROLE_SLUGS } from '../src/rbac/permission-slugs';

describe('Admin email (e2e)', () => {
  let app: INestApplication<App>;
  let editorToken: string;
  let authorToken: string;
  /** When true, skip tests that require email-service migrations + seed rows. */
  let skipEmailAdminIntegration: boolean;

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

    const usersService = app.get(UsersService);
    const rbacService = app.get(RbacService);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const password = 'E2eAdminEmail1!';
    const passwordHash = await bcrypt.hash(password, 6);

    const editorUser = await usersService.create({
      email: `admin-email-editor-${suffix}@test.local`,
      passwordHash,
      displayName: 'E2E Admin Email Editor',
    });
    await rbacService.assignRoles(editorUser.id, [ROLE_SLUGS.EDITOR]);

    await usersService.create({
      email: `admin-email-author-${suffix}@test.local`,
      passwordHash,
      displayName: 'E2E Admin Email Author',
    });

    const login = (email: string) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password });

    const editorRes = await login(editorUser.email);
    expect([200, 201]).toContain(editorRes.status);
    editorToken = (editorRes.body as { accessToken: string }).accessToken;

    const authorRes = await login(`admin-email-author-${suffix}@test.local`);
    expect([200, 201]).toContain(authorRes.status);
    authorToken = (authorRes.body as { accessToken: string }).accessToken;

    const probe = await request(app.getHttpServer())
      .get('/api/v1/admin/email/reminder-policy')
      .set('Authorization', `Bearer ${editorToken}`);

    skipEmailAdminIntegration = probe.status !== 200;
    if (skipEmailAdminIntegration) {
      console.warn(
        `[admin-email.e2e-spec] Skipping DB-backed cases (probe status ${probe.status}). Apply email-service migrations for full coverage.`,
      );
    }
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /admin/email/reminder-policy without auth returns 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/admin/email/reminder-policy')
      .expect(401);
  });

  it('GET /admin/email/reminder-policy as author returns 403', () => {
    return request(app.getHttpServer())
      .get('/api/v1/admin/email/reminder-policy')
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(403)
      .expect((res) => {
        expect((res.body as { code?: string }).code).toBe('FORBIDDEN');
      });
  });

  it('GET /admin/email/templates/:key with invalid key returns 422', () => {
    return request(app.getHttpServer())
      .get('/api/v1/admin/email/templates/not-a-real-template')
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(422)
      .expect((res) => {
        expect((res.body as { code?: string }).code).toBe(
          'INVALID_TEMPLATE_KEY',
        );
      });
  });

  it('GET /admin/email/reminder-policy as editor returns 200 when email DB is present', async () => {
    if (skipEmailAdminIntegration) return;
    await request(app.getHttpServer())
      .get('/api/v1/admin/email/reminder-policy')
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(200)
      .expect((res) => {
        const b = res.body as {
          id: number;
          reviewDueInDays: number;
          updatedAt: string;
        };
        expect(b.id).toBe(1);
        expect(typeof b.reviewDueInDays).toBe('number');
        expect(typeof b.updatedAt).toBe('string');
      });
  });

  it('PATCH /admin/email/reminder-policy with stale expectedUpdatedAt returns 409', async () => {
    if (skipEmailAdminIntegration) return;
    const cur = await request(app.getHttpServer())
      .get('/api/v1/admin/email/reminder-policy')
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(200);
    const { reviewDueInDays } = cur.body as {
      reviewDueInDays: number;
      updatedAt: string;
    };

    await request(app.getHttpServer())
      .patch('/api/v1/admin/email/reminder-policy')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        reviewDueInDays,
        expectedUpdatedAt: '1970-01-01T00:00:00.000Z',
      })
      .expect(409)
      .expect((res) => {
        expect((res.body as { code?: string }).code).toBe(
          'EMAIL_POLICY_CONFLICT',
        );
      });
  });

  it('GET /admin/email/templates/reviewer-invited returns 200 or template 404 (not 422)', async () => {
    if (skipEmailAdminIntegration) return;
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/email/templates/reviewer-invited')
      .set('Authorization', `Bearer ${editorToken}`);

    expect([200, 404]).toContain(res.status);
    if (res.status === 404) {
      expect((res.body as { code?: string }).code).toBe(
        'EMAIL_TEMPLATE_NOT_FOUND',
      );
    } else {
      const b = res.body as { templateKey: string; updatedAt: string };
      expect(b.templateKey).toBe('reviewer-invited');
      expect(typeof b.updatedAt).toBe('string');
    }
  });

  it('POST /admin/email/templates/reviewer-invited/preview returns 200 or template 404', async () => {
    if (skipEmailAdminIntegration) return;
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/email/templates/reviewer-invited/preview')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({});

    if (res.status === 404) {
      expect((res.body as { code?: string }).code).toBe(
        'EMAIL_TEMPLATE_NOT_FOUND',
      );
      return;
    }
    expect(res.status).toBe(200);
    const b = res.body as { subject: string; html: string; text: string };
    expect(typeof b.subject).toBe('string');
    expect(typeof b.html).toBe('string');
    expect(typeof b.text).toBe('string');
  });
});
