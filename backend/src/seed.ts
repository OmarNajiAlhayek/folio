import 'reflect-metadata';
import { config } from 'dotenv';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { AiClientService } from './ai/ai-client.service';
import { ensurePublicationSearchSchema } from './common/ensure-publication-search-schema';
import {
  placeDemoSubmissions,
  seedPressFixtures,
} from './journals/seed-journals';
import { ROLE_SLUGS } from './rbac/permission-slugs';
import {
  assertSeedAllowed,
  describeSeedTarget,
  SeedNotAllowedError,
} from './seed-guard';
import { SectionEditorWorkflowService } from './submissions/section-editor-workflow.service';
import { SubmissionsService } from './submissions/submissions.service';
import { RbacService } from './rbac/rbac.service';
import { UsersService } from './users/users.service';
import {
  requireSeedEditors,
  seedCoreAccounts,
  seedJournalEditors,
} from './seed/accounts';
import type { SeedContext } from './seed/context';
import { seedPerfFixtures } from './seed/perf-fixtures';
import { seedPublishedSamples } from './seed/published-samples';
import { resetAllDevData, resetSampleSubmissions } from './seed/reset';
import { printSeedSummary } from './seed/summary';
import { seedWorkflowSamples } from './seed/workflow-samples';

config({ path: join(__dirname, '..', '.env') });

async function run() {
  // Before anything touches the database. See seed-guard.ts for why.
  assertSeedAllowed();

  const resetAll = process.env.SEED_RESET_ALL === '1';
  const resetSample =
    !resetAll &&
    (process.env.SEED_RESET_SAMPLE === '1' ||
      process.env.SEED_RESET_DEMO === '1');

  if (resetAll || resetSample) {
    console.log(`Destructive seed confirmed — target ${describeSeedTarget()}`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const dataSource = app.get(DataSource);
  await ensurePublicationSearchSchema(dataSource);
  console.log('Publication catalog search schema ready (FTS + pg_trgm).');

  const usersService = app.get(UsersService);
  const rbacService = app.get(RbacService);
  const submissionsService = app.get(SubmissionsService);
  const sectionEditors = app.get(SectionEditorWorkflowService);
  const aiClient = app.get(AiClientService);
  const aiEnabled = aiClient.isEnabled();
  const ctx: SeedContext = {
    dataSource,
    usersService,
    rbacService,
    submissionsService,
    sectionEditors,
    aiClient,
  };

  if (resetAll) {
    await resetAllDevData(dataSource);
  } else if (resetSample) {
    await resetSampleSubmissions(dataSource);
  }

  await submissionsService.backfillSlugs();

  const accounts = await seedCoreAccounts(ctx);
  const press = await seedPressFixtures(dataSource, [
    { userId: accounts.reviewer.id, roleSlug: ROLE_SLUGS.REVIEWER },
    { userId: accounts.copyeditor.id, roleSlug: ROLE_SLUGS.COPYEDITOR },
  ]);
  const journalStaff = await seedJournalEditors({ ctx, press });
  const editors = requireSeedEditors(journalStaff);

  await seedWorkflowSamples({
    ctx,
    author: accounts.author,
    authorReq: accounts.authorReq,
    reviewer: accounts.reviewer,
    copyeditor: accounts.copyeditor,
    press,
    journalStaff,
    editors,
  });
  await seedPublishedSamples({
    ctx,
    author: accounts.author,
    authorReq: accounts.authorReq,
    copyeditor: accounts.copyeditor,
    copyeditorReq: accounts.copyeditorReq,
    press,
    editors,
  });

  const placement = await placeDemoSubmissions(
    dataSource,
    press.journalsBySlug,
    press.publishedIssueByJournalId,
  );

  if (
    process.env.SEED_PERF_FIXTURES !== '1' &&
    aiClient.isSimilarityEnabled()
  ) {
    const indexJobs =
      await submissionsService.enqueueMissingSimilarityIndexJobs();
    console.log(
      `Enqueued ${indexJobs} similarity index job(s) for published [Demo] articles (processed async via RabbitMQ).`,
    );
  }

  printSeedSummary({
    author: accounts.author,
    reviewer: accounts.reviewer,
    copyeditor: accounts.copyeditor,
    press,
    placement,
    aiEnabled,
  });

  if (process.env.SEED_PERF_FIXTURES === '1') {
    await seedPerfFixtures({ ctx, press });
    console.log(
      '  SEED_PERF_FIXTURES=1   — perf/fixtures.json written (npm run seed:perf)',
    );
  }

  await app.close();
}

run().catch((e) => {
  // A refused seed is an operator mistake, not a crash — print the reason
  // rather than a stack trace nobody reads.
  if (e instanceof SeedNotAllowedError) {
    console.error(`\n${e.message}\n`);
    process.exit(1);
  }
  console.error(e);
  process.exit(1);
});
