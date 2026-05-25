/**
 * Opt-in integration: assign reviewer → outbox published → RabbitMQ message.
 *
 * Requires Postgres (same `DB_*` as backend `.env`) and RabbitMQ (`RABBITMQ_URL`,
 * default `amqp://localhost:5672`). Binds an exclusive queue to `reviewer.invited`
 * so a running email-service worker does not steal messages.
 *
 *   cd backend
 *   set EMAIL_PIPELINE_INTEGRATION=1   # PowerShell: $env:EMAIL_PIPELINE_INTEGRATION='1'
 *   npm run test:pipeline
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as amqplib from 'amqplib';
import request from 'supertest';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { OutboundEvent } from '../src/entities/outbound-event.entity';
import { Submission } from '../src/entities/submission.entity';
import { SubmissionStatus } from '../src/entities/submission-status.enum';
import { ROUTING_KEY } from '../src/messaging/contracts/email-events';
import { OutboxDrainerService } from '../src/messaging/outbox-drainer.service';
import {
  assertTopology,
  DEFAULT_TOPOLOGY,
} from '../src/messaging/shared/topology';
import { reviewerInvitedKey } from '../src/messaging/shared/idempotency';
import { UsersService } from '../src/users/users.service';
import { RbacService } from '../src/rbac/rbac.service';
import { ROLE_SLUGS } from '../src/rbac/permission-slugs';

const ENABLED = process.env.EMAIL_PIPELINE_INTEGRATION === '1';
const RABBIT_URL = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

(ENABLED ? describe : describe.skip)(
  'Email pipeline (integration)',
  () => {
    let app: INestApplication<App>;
    let rabbitOk = false;
    let skipReason = '';
    let editorToken = '';
    let reviewerId = '';
    let submissionSlug = '';
    let outboxRepo: Repository<OutboundEvent>;
    let drainer: OutboxDrainerService;

    beforeAll(async () => {
      try {
        const conn = await amqplib.connect(RABBIT_URL);
        const ch = await conn.createChannel();
        await assertTopology(ch);
        await ch.close();
        await conn.close();
        rabbitOk = true;
      } catch (err) {
        skipReason =
          err instanceof Error ? err.message : 'RabbitMQ unreachable';
        console.warn(
          `[email-pipeline.integration] Skipping: ${skipReason}. Start RabbitMQ (docker compose -f docker-compose.dev.yml up -d).`,
        );
      }

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

      outboxRepo = app.get(getRepositoryToken(OutboundEvent));
      drainer = app.get(OutboxDrainerService);

      const usersService = app.get(UsersService);
      const rbacService = app.get(RbacService);
      const submissionsRepo = app.get(getRepositoryToken(Submission));
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const password = 'PipeInteg1!';
      const passwordHash = await bcrypt.hash(password, 6);

      const author = await usersService.create({
        email: `pipe-author-${suffix}@test.local`,
        passwordHash,
        displayName: 'Pipeline Author',
      });

      const editor = await usersService.create({
        email: `pipe-editor-${suffix}@test.local`,
        passwordHash,
        displayName: 'Pipeline Editor',
      });
      await rbacService.assignRoles(editor.id, [ROLE_SLUGS.EDITOR]);

      const reviewer = await usersService.create({
        email: `pipe-reviewer-${suffix}@test.local`,
        passwordHash,
        displayName: 'Pipeline Reviewer',
        willingToReview: true,
      });
      await rbacService.assignRoles(reviewer.id, [ROLE_SLUGS.REVIEWER]);
      reviewerId = reviewer.id;

      submissionSlug = `pipe-sub-${suffix}`;
      await submissionsRepo.save(
        submissionsRepo.create({
          authorId: author.id,
          slug: submissionSlug,
          title: 'Pipeline integration submission',
          abstract: 'Abstract for email pipeline integration test.',
          status: SubmissionStatus.UNDER_REVIEW,
          originalityConfirmed: true,
        }),
      );

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: editor.email, password });
      expect([200, 201]).toContain(loginRes.status);
      editorToken = (loginRes.body as { accessToken: string }).accessToken;
      expect(editorToken).toBeTruthy();
    }, 90_000);

    afterAll(async () => {
      await app?.close();
    });

    it('publishes reviewer.invited to RabbitMQ after outbox drain', async () => {
      if (!rabbitOk) {
        console.warn(
          `[email-pipeline.integration] Skipped assertion: ${skipReason}`,
        );
        return;
      }

      const conn = await amqplib.connect(RABBIT_URL);
      const ch = await conn.createChannel();
      const captureQueue = `test.pipeline.${Date.now()}`;
      await ch.assertQueue(captureQueue, {
        exclusive: true,
        durable: false,
        autoDelete: true,
      });
      await ch.bindQueue(
        captureQueue,
        DEFAULT_TOPOLOGY.exchange,
        ROUTING_KEY.reviewerInvited,
      );

      let assignmentSlug = '';
      try {
        const assignRes = await request(app.getHttpServer())
          .post(`/api/v1/submissions/${submissionSlug}/assignments`)
          .set('Authorization', `Bearer ${editorToken}`)
          .send({ reviewerId });
        expect([200, 201]).toContain(assignRes.status);
        assignmentSlug = (assignRes.body as { slug: string }).slug;
        expect(assignmentSlug).toBeTruthy();

        const deadline = Date.now() + 25_000;
        let published: OutboundEvent | null = null;
        while (Date.now() < deadline) {
          await drainer.tick();
          const rows = await outboxRepo.find({
            where: { routingKey: ROUTING_KEY.reviewerInvited },
            order: { createdAt: 'DESC' },
            take: 10,
          });
          published =
            rows.find(
              (r) =>
                r.status === 'published' &&
                (r.payload as { assignmentSlug?: string }).assignmentSlug ===
                  assignmentSlug,
            ) ?? null;
          if (published) break;
          await sleep(250);
        }

        expect(published).not.toBeNull();
        expect(published!.routingKey).toBe(ROUTING_KEY.reviewerInvited);

        const payload = published!.payload as {
          type: string;
          idempotencyKey: string;
          assignmentSlug: string;
          submissionSlug: string;
        };
        expect(payload.type).toBe('ReviewerInvited');
        expect(payload.assignmentSlug).toBe(assignmentSlug);
        expect(payload.submissionSlug).toBe(submissionSlug);
        expect(payload.idempotencyKey).toBe(
          reviewerInvitedKey(assignmentSlug),
        );

        let msg: amqplib.GetMessage | false = false;
        const consumeDeadline = Date.now() + 5_000;
        while (Date.now() < consumeDeadline) {
          msg = await ch.get(captureQueue, { noAck: false });
          if (msg) break;
          await sleep(200);
        }
        expect(msg).toBeTruthy();
        const raw = (msg as amqplib.GetMessage).content;
        expect(Buffer.isBuffer(raw)).toBe(true);
        const body = JSON.parse(raw.toString('utf8')) as {
          type: string;
          idempotencyKey: string;
          assignmentSlug: string;
        };
        expect(body.type).toBe('ReviewerInvited');
        expect(body.assignmentSlug).toBe(assignmentSlug);
        expect(body.idempotencyKey).toBe(reviewerInvitedKey(assignmentSlug));
        ch.ack(msg as amqplib.GetMessage);
      } finally {
        await ch.close();
        await conn.close();
      }
    }, 30_000);
  },
);
