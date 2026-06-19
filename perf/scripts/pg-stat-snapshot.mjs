/**
 * Snapshot pg_stat_statements and table scan ratios during perf runs.
 *
 * Modes:
 *   (default)      snapshot stats and enforce thresholds
 *   --reset-only   reset pg_stat_statements and exit (call before k6 suites)
 *   --ci           exit non-zero on any threshold violation
 *   --skip-if-unavailable  treat missing extension as a warning, not a failure
 *
 * SQL notes:
 *   slowQueryP95Ms is enforced against a P95 estimate of mean + 1.645 * stddev,
 *   which gives a reasonable approximation under a roughly normal distribution.
 *   pg_stat_statements.stddev_exec_time requires PostgreSQL 13+.
 *
 * Env: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE
 *      PERF_THRESHOLDS (default perf/thresholds.json)
 *      PERF_CI=1 to enforce database thresholds
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { resolveDbConfig } from '../lib/backend-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERF_DIR = join(__dirname, '..');
const REPORTS_DIR = join(PERF_DIR, 'reports');
const THRESHOLDS_PATH =
  process.env.PERF_THRESHOLDS ?? join(PERF_DIR, 'thresholds.json');
const QUERY_BUDGETS_PATH = join(PERF_DIR, 'query-budgets.json');
const OUTPUT_PATH = join(REPORTS_DIR, 'pg-stat.json');

const require = createRequire(import.meta.url);
const { Client } = require(join(PERF_DIR, '..', 'backend', 'node_modules', 'pg'));

const thresholds = JSON.parse(readFileSync(THRESHOLDS_PATH, 'utf8'));
const queryBudgets = JSON.parse(readFileSync(QUERY_BUDGETS_PATH, 'utf8'));
const ci = process.env.PERF_CI === '1' || process.argv.includes('--ci');
const skipIfUnavailable = process.argv.includes('--skip-if-unavailable');
const resetOnly = process.argv.includes('--reset-only');

function makeClient() {
  const db = resolveDbConfig();
  return new Client({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
  });
}

async function resetStats() {
  const client = makeClient();
  try {
    await client.connect();
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
    await client.query('SELECT pg_stat_statements_reset()');
    console.log('pg-stat-snapshot: reset pg_stat_statements');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const unavailable = /pg_stat_statements|shared_preload_libraries|extension/i.test(message);
    if (skipIfUnavailable && unavailable) {
      console.warn(`pg-stat-snapshot: skipped reset (${message})`);
    } else {
      console.error(`pg-stat-snapshot: reset failed — ${message}`);
      if (ci) process.exit(1);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

async function snapshotStats() {
  const client = makeClient();
  mkdirSync(REPORTS_DIR, { recursive: true });

  const out = {
    generatedAt: new Date().toISOString(),
    passed: true,
    violations: [],
    topByP95: [],
    topByTotalTime: [],
    tableScanRatios: [],
    queryBudgetChecks: [],
  };

  try {
    await client.connect();
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');

    // P95 estimate: mean + 1.645 * stddev (stddev_exec_time requires PG 13+).
    // COALESCE handles the single-call case where stddev is NULL.
    const p95Expr =
      'mean_exec_time + 1.645 * COALESCE(stddev_exec_time, 0)';

    const topP95 = await client.query(
      `SELECT queryid::text,
              left(query, 300) AS query,
              calls,
              mean_exec_time,
              stddev_exec_time,
              total_exec_time,
              ${p95Expr} AS p95_est_ms
         FROM pg_stat_statements
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
        ORDER BY ${p95Expr} DESC
        LIMIT $1`,
      [thresholds.database?.topQueryCount ?? 20],
    );
    out.topByP95 = topP95.rows;

    const topTotal = await client.query(
      `SELECT queryid::text,
              left(query, 300) AS query,
              calls,
              mean_exec_time,
              stddev_exec_time,
              total_exec_time,
              ${p95Expr} AS p95_est_ms
         FROM pg_stat_statements
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
        ORDER BY total_exec_time DESC
        LIMIT $1`,
      [thresholds.database?.topQueryCount ?? 20],
    );
    out.topByTotalTime = topTotal.rows;

    // Seq-scan ratio check on hot tables.
    const hotTables = thresholds.database?.hotTables ?? [];
    for (const table of hotTables) {
      const stat = await client.query(
        `SELECT relname, seq_scan, idx_scan,
                CASE WHEN (seq_scan + idx_scan) = 0 THEN 0
                     ELSE seq_scan::float / (seq_scan + idx_scan) END AS seq_scan_ratio
           FROM pg_stat_user_tables
          WHERE relname = $1`,
        [table],
      );
      if (stat.rows[0]) {
        out.tableScanRatios.push(stat.rows[0]);
        const ratio = Number(stat.rows[0].seq_scan_ratio);
        if (ratio > (thresholds.database?.maxSeqScanRatio ?? 0.1)) {
          out.passed = false;
          out.violations.push(
            `table ${table} seq_scan_ratio ${ratio.toFixed(3)} exceeds max ${thresholds.database.maxSeqScanRatio}`,
          );
        }
      }
    }

    // Slow-query check using P95 estimate (not mean) against slowQueryP95Ms.
    const slowP95Ms = thresholds.database?.slowQueryP95Ms ?? 500;
    for (const row of topP95.rows) {
      const p95Est = Number(row.p95_est_ms);
      if (p95Est > slowP95Ms) {
        out.violations.push(
          `query p95_est ${p95Est.toFixed(1)}ms exceeds ${slowP95Ms}ms: ${row.query?.slice(0, 80)}`,
        );
      }
    }

    // Per-query budget checks.
    // Each budget specifies a queryPattern (substring) and optional queryType
    // (select/insert/update/delete) to filter the matching rows more precisely.
    // A direct DB query per budget avoids false matches from pre-fetched top-N rows.
    for (const [name, budget] of Object.entries(queryBudgets)) {
      const pattern = budget.queryPattern.toLowerCase();
      const opType = (budget.queryType ?? 'select').toLowerCase();
      const maxP95Ms = budget.maxP95Ms;

      const result = await client.query(
        `SELECT queryid::text,
                left(query, 300) AS query,
                calls,
                mean_exec_time,
                stddev_exec_time,
                mean_exec_time + 1.645 * COALESCE(stddev_exec_time, 0) AS p95_est_ms
           FROM pg_stat_statements
          WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
            AND lower(query) LIKE $1
            AND lower(ltrim(query)) LIKE $2
          ORDER BY p95_est_ms DESC
          LIMIT 1`,
        [`%${pattern}%`, `${opType} %`],
      );

      const match = result.rows[0] ?? null;
      const p95EstMs = match ? Number(match.p95_est_ms) : null;
      const ok = p95EstMs === null || p95EstMs <= maxP95Ms;

      out.queryBudgetChecks.push({ name, pattern, queryType: opType, p95EstMs, maxP95Ms, ok });

      if (!ok) {
        out.passed = false;
        out.violations.push(
          `query budget ${name}: p95_est ${p95EstMs.toFixed(1)}ms > ${maxP95Ms}ms`,
        );
      }
    }

    if (out.violations.length > 0 && ci) {
      out.passed = false;
    } else if (!ci && out.violations.length > 0) {
      console.warn('pg-stat warnings:', out.violations);
      out.passed = true;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const unavailable =
      /pg_stat_statements|shared_preload_libraries|extension/i.test(message);
    out.error = message;
    out.violations.push(message);
    console.warn(`pg-stat-snapshot: ${message}`);
    if (skipIfUnavailable && unavailable && !ci) {
      out.skipped = true;
      out.passed = true;
      out.violations = [];
    } else {
      out.passed = false;
    }
  } finally {
    await client.end().catch(() => {});
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUTPUT_PATH} (passed=${out.passed})`);
  if (ci && !out.passed) process.exit(1);
}

if (resetOnly) {
  await resetStats();
} else {
  await snapshotStats();
}
