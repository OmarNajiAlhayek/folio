/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
/**
 * Opt-in integration: enqueue AI job → outbox published → RabbitMQ → worker completes job.
 *
 * Requires Postgres, RabbitMQ, and (for full completion) ai-service with
 * AI_SIMILARITY_ENABLED / SIMILARITY_ENABLED.
 *
 *   cd backend
 *   set AI_JOBS_PIPELINE_INTEGRATION=1
 *   set AUTH_RETURN_BEARER=true
 *   npm run test:ai-jobs
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as amqplib from 'amqplib';
import request from 'supertest';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AiJob } from '../src/entities/ai-job.entity';
import { OutboundEvent } from '../src/entities/outbound-event.entity';
import { Submission } from '../src/entities/submission.entity';
import { SubmissionStatus } from '../src/entities/submission-status.enum';
import { AI_ROUTING_KEY } from '../src/messaging/contracts/ai-events';
import { OutboxDrainerService } from '../src/messaging/outbox-drainer.service';
import { assertTopology } from '../src/messaging/shared/topology';
import { similarityIndexKey } from '../src/messaging/shared/idempotency';
import { SubmissionsService } from '../src/submissions/submissions.service';
import { UsersService } from '../src/users/users.service';
import { RbacService } from '../src/rbac/rbac.service';
import { ROLE_SLUGS } from '../src/rbac/permission-slugs';
import { MIN_CORPUS_PLAIN_TEXT_CHARS } from '../src/submissions/submission-corpus-text.util';
import { configureNestTestApp } from './configure-nest-test-app';

const ENABLED = process.env.AI_JOBS_PIPELINE_INTEGRATION === '1';
const RABBIT_URL = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

(ENABLED ? describe : describe.skip)('AI jobs pipeline (integration)', () => {
  let app: INestApplication<App>;
  let rabbitOk = false;
  let skipReason = '';
  let editorToken = '';
  let submissionSlug = '';
  let submissionId = '';
  let outboxRepo: Repository<OutboundEvent>;
  let jobsRepo: Repository<AiJob>;
  let drainer: OutboxDrainerService;
  let submissionsService: SubmissionsService;

  beforeAll(async () => {
    try {
      const conn = await amqplib.connect(RABBIT_URL);
      const ch = await conn.createChannel();
      await assertTopology(ch);
      await ch.close();
      await conn.close();
      rabbitOk = true;
    } catch (err) {
      skipReason = err instanceof Error ? err.message : 'RabbitMQ unreachable';
      console.warn(
        `[ai-jobs-pipeline.integration] Skipping: ${skipReason}. Start RabbitMQ (docker compose -f docker-compose.dev.yml up -d).`,
      );
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureNestTestApp(app);
    await app.init();

    outboxRepo = app.get(getRepositoryToken(OutboundEvent));
    jobsRepo = app.get(getRepositoryToken(AiJob));
    drainer = app.get(OutboxDrainerService);
    submissionsService = app.get(SubmissionsService);

    const usersService = app.get(UsersService);
    const rbacService = app.get(RbacService);
    const submissionsRepo = app.get(getRepositoryToken(Submission));
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const password = 'AiJobsInteg1!';
    const passwordHash = await bcrypt.hash(password, 6);

    const author = await usersService.create({
      email: `aijobs-author-${suffix}@test.local`,
      passwordHash,
      displayName: 'AI Jobs Author',
    });

    const editor = await usersService.create({
      email: `aijobs-editor-${suffix}@test.local`,
      passwordHash,
      displayName: 'AI Jobs Editor',
    });
    await rbacService.assignRoles(editor.id, [ROLE_SLUGS.EDITOR]);

    submissionSlug = `aijobs-sub-${suffix}`;
    const saved = await submissionsRepo.save(
      submissionsRepo.create({
        authorId: author.id,
        slug: submissionSlug,
        title: 'AI jobs pipeline integration submission',
        abstract: 'A'.repeat(MIN_CORPUS_PLAIN_TEXT_CHARS),
        status: SubmissionStatus.PUBLISHED,
        originalityConfirmed: true,
        publishedAt: new Date(),
      }),
    );
    submissionId = saved.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: editor.email, password });
    expect([200, 201]).toContain(loginRes.status);
    editorToken = (loginRes.body as { accessToken: string }).accessToken;
    expect(editorToken).toBeTruthy();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('publishes ai.similarity_index.requested and processes the job', async () => {
    if (!rabbitOk) {
      console.warn(
        `[ai-jobs-pipeline.integration] Skipped assertion: ${skipReason}`,
      );
      return;
    }

    await submissionsService.enqueuePublishedSubmissionForSimilarity(
      submissionId,
    );

    const idempotencyKey = similarityIndexKey(submissionId);
    const deadline = Date.now() + 90_000;
    let job: AiJob | null = null;
    while (Date.now() < deadline) {
      await drainer.tick();
      job = await jobsRepo.findOne({ where: { idempotencyKey } });
      if (job?.status === 'completed' || job?.status === 'failed') break;
      await sleep(500);
    }

    expect(job).not.toBeNull();
    expect(['completed', 'failed']).toContain(job!.status);

    const published = await outboxRepo.findOne({
      where: {
        routingKey: AI_ROUTING_KEY.similarityIndexRequested,
        status: 'published',
      },
      order: { createdAt: 'DESC' },
    });
    expect(published).not.toBeNull();
    expect((published!.payload as { submissionId?: string }).submissionId).toBe(
      submissionId,
    );
  }, 120_000);

  it('runs corpus similarity as an async job via HTTP', async () => {
    if (!rabbitOk) {
      console.warn(
        `[ai-jobs-pipeline.integration] Skipped assertion: ${skipReason}`,
      );
      return;
    }

    const startRes = await request(app.getHttpServer())
      .post(`/api/v1/submissions/${submissionSlug}/corpus-similarity/jobs`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect([200, 201]).toContain(startRes.status);

    const body = startRes.body as { jobId?: string; status?: string };
    if (!body.jobId) {
      expect(body.status).toBeDefined();
      return;
    }

    const deadline = Date.now() + 120_000;
    let finalBody: { status: string; result?: { status: string } } = {
      status: 'pending',
    };
    while (Date.now() < deadline) {
      await drainer.tick();
      const poll = await request(app.getHttpServer())
        .get(
          `/api/v1/submissions/${submissionSlug}/corpus-similarity/jobs/${body.jobId}`,
        )
        .set('Authorization', `Bearer ${editorToken}`);
      expect(poll.status).toBe(200);
      finalBody = poll.body as typeof finalBody;
      if (finalBody.status === 'completed' || finalBody.status === 'failed') {
        break;
      }
      await sleep(750);
    }

    expect(['completed', 'failed']).toContain(finalBody.status);
    if (finalBody.status === 'completed') {
      expect(finalBody.result?.status).toBeDefined();
    }
  }, 150_000);
});
