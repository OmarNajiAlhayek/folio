/**
 * Orchestrate perf benchmarks: k6 HTTP suites + ai-service gRPC bench + DB snapshots.
 *
 * Usage:
 *   node perf/run.mjs
 *   node perf/run.mjs --ci          strict exit code on threshold breach
 *   node perf/run.mjs --skip-setup  assume perf/.env.json exists
 *   node perf/run.mjs --only <suite>   run one suite (see SUITE_NAMES below)
 *   node perf/run.mjs --skip-advanced  skip pool-stress, soak, typesense
 *   node perf/run.mjs --continue-on-failure  run all suites; exit non-zero at end
 *
 * Requires: k6 on PATH, Python ai-service for gRPC bench.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const ci = args.includes('--ci');
const skipSetup = args.includes('--skip-setup');
const skipAdvanced = args.includes('--skip-advanced');
const continueOnFailure = args.includes('--continue-on-failure');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

const SUITE_NAMES = [
  'review-submit',
  'email-pipeline',
  'editor-queue',
  'reviewer-inbox',
  'auth-login',
  'public-search',
  'notifications',
  'submission-detail',
  'file-upload',
  'audit-stress',
  'write-read-concurrent',
  'ai-grpc',
  'typesense',
  'pool-stress',
  'soak',
];

const DEFAULT_SUITES = [
  'review-submit',
  'email-pipeline',
  'editor-queue',
  'reviewer-inbox',
  'auth-login',
  'public-search',
  'notifications',
  'submission-detail',
  'file-upload',
  'audit-stress',
  'write-read-concurrent',
  'ai-grpc',
  'typesense',
];

const ADVANCED_SUITES = ['pool-stress', 'soak'];

const failedSuites = [];

function run(cmd, cmdArgs, opts = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    stdio: 'inherit',
    shell: false,
    ...opts,
  });
  if (result.status !== 0) {
    if (continueOnFailure) {
      return result.status ?? 1;
    }
    process.exit(result.status ?? 1);
  }
  return 0;
}

function runNode(script, extraArgs = [], env = {}) {
  return run('node', [script, ...extraArgs], {
    cwd: ROOT,
    env: { ...process.env, ...env },
  });
}

function k6Available() {
  const probe = spawnSync('k6', ['version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return probe.status === 0;
}

function runK6(scriptName, reportName) {
  if (!k6Available()) {
    console.error('perf run: k6 not found — install from https://k6.io/docs/get-started/installation/');
    if (!continueOnFailure) process.exit(1);
    return 1;
  }
  return run(
    'k6',
    [
      'run',
      '--summary-export',
      join(__dirname, 'reports', `${reportName}-summary.json`),
      join(__dirname, 'k6', scriptName),
    ],
    { cwd: __dirname, env: { ...process.env, PERF_CONFIG: envJson } },
  );
}

function recordFailure(name, status) {
  if (status !== 0) {
    failedSuites.push({ name, status });
    console.error(`\nperf: suite "${name}" failed (exit ${status})\n`);
  }
}

// Generate k6 thresholds from SSOT
runNode(join('perf', 'scripts', 'generate-k6-thresholds.mjs'));

if (!skipSetup) {
  runNode(join('perf', 'setup.mjs'));
}

const envJson = join(__dirname, '.env.json');
if (!existsSync(envJson)) {
  console.error('perf run: missing perf/.env.json — run perf/setup.mjs first');
  process.exit(1);
}

mkdirSync(join(__dirname, 'reports'), { recursive: true });

// Reset pg_stat_statements before any k6 suites so the snapshot captures only
// queries generated during this perf run (not seed operations or prior runs).
if (!only) {
  console.log('\n=== perf: reset pg_stat_statements ===\n');
  const resetArgs = ['--reset-only'];
  if (skipAdvanced) resetArgs.push('--skip-if-unavailable');
  const resetStatus = runNode(join('perf', 'scripts', 'pg-stat-snapshot.mjs'), resetArgs, {
    PERF_CI: ci ? '1' : '0',
  });
  if (continueOnFailure) {
    recordFailure('pg-stat-reset', resetStatus);
  }
}

function shouldRun(name) {
  if (only) return only === name;
  if (skipAdvanced && ADVANCED_SUITES.includes(name)) return false;
  return DEFAULT_SUITES.includes(name);
}

const k6Suites = {
  'review-submit': () => runK6('review-submit.k6.js', 'review-submit'),
  'email-pipeline': () => runK6('email-pipeline.k6.js', 'email-pipeline'),
  'editor-queue': () => runK6('editor-queue.k6.js', 'editor-queue'),
  'reviewer-inbox': () => runK6('reviewer-inbox.k6.js', 'reviewer-inbox'),
  'auth-login': () => runK6('auth-login.k6.js', 'auth-login'),
  'public-search': () => runK6('public-search.k6.js', 'public-search'),
  notifications: () => runK6('notifications.k6.js', 'notifications'),
  'submission-detail': () => runK6('submission-detail.k6.js', 'submission-detail'),
  'file-upload': () => runK6('file-upload.k6.js', 'file-upload'),
  'audit-stress': () => runK6('audit-stress.k6.js', 'audit-stress'),
  'write-read-concurrent': () => runK6('write-read-concurrent.k6.js', 'write-read-concurrent'),
  'pool-stress': () => runK6('pool-stress.k6.js', 'pool-stress'),
  soak: () => runK6('soak.k6.js', 'soak'),
};

for (const name of SUITE_NAMES) {
  if (!shouldRun(name)) continue;

  console.log(`\n=== perf: ${name} ===\n`);

  let status = 0;

  if (k6Suites[name]) {
    status = k6Suites[name]();
  } else if (name === 'ai-grpc') {
    const script = join(ROOT, 'services', 'ai-service', 'scripts', 'ai_grpc_bench.py');
    const config = JSON.parse(readFileSync(envJson, 'utf8'));
    const pyArgs = [
      script,
      '--host',
      config.aiGrpcHost ?? 'localhost:5246',
      '--api-base',
      config.baseUrl,
      '--editor-token',
      config.editorToken,
      '--output',
      join(__dirname, 'reports', 'ai-grpc.json'),
      '--thresholds',
      join(__dirname, 'thresholds.json'),
    ];
    if (config.corpusSimilarity?.submissionSlug) {
      pyArgs.push('--corpus-slug', config.corpusSimilarity.submissionSlug);
    }
    if (ci) pyArgs.push('--ci');
    const python = process.env.PYTHON ?? 'python';
    status = run(python, pyArgs, { cwd: join(ROOT, 'services', 'ai-service') });
  } else if (name === 'typesense') {
    status = runNode(join('perf', 'scripts', 'typesense-bench.mjs'), ci ? ['--ci'] : []);
  }

  if (continueOnFailure) {
    recordFailure(name, status);
  } else if (status !== 0) {
    process.exit(status);
  }
}

// DB snapshot after HTTP suites
if (!only || only !== 'ai-grpc') {
  console.log('\n=== perf: pg-stat-snapshot ===\n');
  const pgStatArgs = ci ? ['--ci'] : [];
  if (!ci) pgStatArgs.push('--skip-if-unavailable');
  const pgStatus = runNode(join('perf', 'scripts', 'pg-stat-snapshot.mjs'), pgStatArgs, {
    PERF_CI: ci ? '1' : '0',
  });
  if (continueOnFailure) {
    recordFailure('pg-stat-snapshot', pgStatus);
  } else if (pgStatus !== 0) {
    process.exit(pgStatus);
  }
}

console.log('\n=== perf: aggregate-reports ===\n');
const aggregateStatus = runNode(join('perf', 'scripts', 'aggregate-reports.mjs'));
if (continueOnFailure) {
  recordFailure('aggregate-reports', aggregateStatus);
}

if (ci) {
  console.log('\n=== perf: compare-baseline ===\n');
  const baselineStatus = runNode(join('perf', 'scripts', 'compare-baseline.mjs'), ['--ci']);
  if (continueOnFailure) {
    recordFailure('compare-baseline', baselineStatus);
  } else if (baselineStatus !== 0) {
    process.exit(baselineStatus);
  } else {
    console.log('\nperf: all suites passed CI thresholds');
  }
}

if (failedSuites.length > 0) {
  console.error('\nperf: failed suites:');
  for (const { name, status } of failedSuites) {
    console.error(`  - ${name} (exit ${status})`);
  }
  process.exit(1);
}

console.log('\nperf: done — reports in perf/reports/');
