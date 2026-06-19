/**
 * Opt-in EXPLAIN plan tests — require live Postgres with migrations applied.
 *
 *   cd backend
 *   npm run seed:perf   # recommended — provides perf-review-submit-* slugs
 *   npm run test:query-plans
 */
import { DataSource, QueryRunner } from 'typeorm';
import { AppDataSource } from '../../src/db/data-source';
import { SubmissionStatus } from '../../src/entities/submission-status.enum';

const ENABLED = process.env.RUN_QUERY_PLAN_TESTS === '1';

function collectPlanNodes(plan: unknown): unknown[] {
  if (!plan || typeof plan !== 'object') return [];
  const nodes: unknown[] = [plan];
  const p = plan as { Plans?: unknown[] };
  if (Array.isArray(p.Plans)) {
    for (const child of p.Plans) {
      nodes.push(...collectPlanNodes(child));
    }
  }
  return nodes;
}

function planText(rows: Array<{ 'QUERY PLAN': unknown }>): string {
  const root = rows[0]?.['QUERY PLAN'];
  return JSON.stringify(collectPlanNodes(root)).toLowerCase();
}

function planUsesIndex(
  rows: Array<{ 'QUERY PLAN': unknown }>,
  indexHint: string,
): boolean {
  return planText(rows).includes(indexHint.toLowerCase());
}

function planUsesIndexScan(rows: Array<{ 'QUERY PLAN': unknown }>): boolean {
  const text = planText(rows);
  return (
    text.includes('index scan') ||
    text.includes('bitmap index scan') ||
    text.includes('index only scan')
  );
}

/** Run EXPLAIN with seqscan disabled so small dev tables still prove index availability. */
async function explainWithIndexes(
  runner: QueryRunner,
  sql: string,
  params: unknown[] = [],
): Promise<Array<{ 'QUERY PLAN': unknown }>> {
  await runner.startTransaction();
  try {
    await runner.query('SET LOCAL enable_seqscan = off');
    const rows = (await runner.query(sql, params)) as Array<{
      'QUERY PLAN': unknown;
    }>;
    await runner.commitTransaction();
    return rows;
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  }
}

(ENABLED ? describe : describe.skip)('Query plans (EXPLAIN)', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  let perfReviewerId: string | undefined;
  let perfAssignmentSlug: string | undefined;

  beforeAll(async () => {
    dataSource = AppDataSource;
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }
    runner = dataSource.createQueryRunner();
    await runner.connect();

    await runner.query('ANALYZE submissions');
    await runner.query('ANALYZE review_assignments');
    await runner.query('ANALYZE outbound_event_outbox');

    const assignmentRows = (await runner.query(
      `SELECT reviewer_id, slug
         FROM review_assignments
        WHERE slug LIKE 'perf-review-submit-%'
        ORDER BY slug
        LIMIT 1`,
    )) as Array<{ reviewer_id: string; slug: string }>;

    if (assignmentRows.length > 0) {
      perfReviewerId = assignmentRows[0].reviewer_id;
      perfAssignmentSlug = assignmentRows[0].slug;
    }
  }, 120_000);

  afterAll(async () => {
    await runner?.release();
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('editor queue uses editor-queue partial index', async () => {
    const rows = await explainWithIndexes(
      runner,
      `EXPLAIN (FORMAT JSON)
       SELECT * FROM submissions
        WHERE status != $1
        ORDER BY updated_at DESC
        LIMIT 50`,
      [SubmissionStatus.DRAFT],
    );
    expect(planUsesIndex(rows, 'ix_submissions_editor_queue')).toBe(true);
  });

  it('reviewer inbox uses reviewer_id index', async () => {
    expect(perfReviewerId).toBeDefined();
    const rows = await explainWithIndexes(
      runner,
      `EXPLAIN (FORMAT JSON)
       SELECT * FROM review_assignments
        WHERE reviewer_id = $1
        ORDER BY assigned_at DESC`,
      [perfReviewerId],
    );
    expect(planUsesIndex(rows, 'ix_review_assignments_reviewer_assigned')).toBe(
      true,
    );
  });

  it('assignment by slug uses slug unique index', async () => {
    expect(perfAssignmentSlug).toBeDefined();
    const rows = await explainWithIndexes(
      runner,
      `EXPLAIN (FORMAT JSON)
       SELECT * FROM review_assignments WHERE slug = $1`,
      [perfAssignmentSlug],
    );
    expect(planUsesIndexScan(rows)).toBe(true);
  });

  it('outbox claim uses pending next_attempt index', async () => {
    const rows = await explainWithIndexes(
      runner,
      `EXPLAIN (FORMAT JSON)
       SELECT id FROM outbound_event_outbox
        WHERE status = 'pending'
          AND (next_attempt_at IS NULL OR next_attempt_at <= now())
        ORDER BY created_at ASC
        LIMIT 25`,
    );
    expect(planUsesIndex(rows, 'ix_outbox_pending_next_attempt')).toBe(true);
  });
});
