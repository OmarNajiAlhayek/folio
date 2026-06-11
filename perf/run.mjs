/**
 * Orchestrate perf benchmarks: k6 HTTP suites + ai-service gRPC bench.
 *
 * Usage:
 *   node perf/run.mjs
 *   node perf/run.mjs --ci          strict exit code on threshold breach
 *   node perf/run.mjs --skip-setup  assume perf/.env.json exists
 *   node perf/run.mjs --only review-submit|email-pipeline|ai-grpc
 *
 * Requires: k6 on PATH, Python ai-service venv for gRPC bench.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const ci = args.includes('--ci');
const skipSetup = args.includes('--skip-setup');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

function run(cmd, cmdArgs, opts = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    stdio: 'inherit',
    shell: false,
    ...opts,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function k6Available() {
  const probe = spawnSync('k6', ['version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return probe.status === 0;
}

if (!skipSetup) {
  run('node', [join(__dirname, 'setup.mjs')]);
}

const envJson = join(__dirname, '.env.json');
if (!existsSync(envJson)) {
  console.error('perf run: missing perf/.env.json — run perf/setup.mjs first');
  process.exit(1);
}

const k6Env = {
  ...process.env,
  PERF_CONFIG: envJson,
};

const suites = [];

if (!only || only === 'review-submit') {
  suites.push({
    name: 'review-submit',
    run: () => {
      if (!k6Available()) {
        console.error('perf run: k6 not found — install from https://k6.io/docs/get-started/installation/');
        process.exit(1);
      }
      run(
        'k6',
        [
          'run',
          '--summary-export',
          join(__dirname, 'reports', 'review-submit-summary.json'),
          join(__dirname, 'k6', 'review-submit.k6.js'),
        ],
        { cwd: __dirname, env: k6Env },
      );
    },
  });
}

if (!only || only === 'email-pipeline') {
  suites.push({
    name: 'email-pipeline',
    run: () => {
      if (!k6Available()) {
        console.error('perf run: k6 not found');
        process.exit(1);
      }
      run(
        'k6',
        [
          'run',
          '--summary-export',
          join(__dirname, 'reports', 'email-pipeline-summary.json'),
          join(__dirname, 'k6', 'email-pipeline.k6.js'),
        ],
        { cwd: __dirname, env: k6Env },
      );
    },
  });
}

if (!only || only === 'ai-grpc') {
  suites.push({
    name: 'ai-grpc',
    run: () => {
      const script = join(
        ROOT,
        'services',
        'ai-service',
        'scripts',
        'ai_grpc_bench.py',
      );
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
      ];
      if (config.corpusSimilarity?.submissionSlug) {
        pyArgs.push(
          '--corpus-slug',
          config.corpusSimilarity.submissionSlug,
        );
      }
      pyArgs.push(
        '--thresholds',
        join(__dirname, 'thresholds.json'),
      );
      if (ci) pyArgs.push('--ci');

      const python = process.env.PYTHON ?? 'python';
      run(python, pyArgs, { cwd: join(ROOT, 'services', 'ai-service') });
    },
  });
}

for (const suite of suites) {
  console.log(`\n=== perf: ${suite.name} ===\n`);
  suite.run();
}

if (ci) {
  console.log('\nperf: all suites passed CI thresholds');
}

console.log('\nperf: done — reports in perf/reports/');
