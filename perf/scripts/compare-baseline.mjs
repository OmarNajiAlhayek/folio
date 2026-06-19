/**
 * Compare perf/reports/summary.json against perf/baselines/summary.json.
 * Fails when HTTP p95 regresses more than thresholds.regression.maxP95DriftPercent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERF_DIR = join(__dirname, '..');
const CURRENT_PATH = join(PERF_DIR, 'reports', 'summary.json');
const BASELINE_PATH = join(PERF_DIR, 'baselines', 'summary.json');
const THRESHOLDS_PATH = join(PERF_DIR, 'thresholds.json');

const ci = process.argv.includes('--ci');

if (!existsSync(CURRENT_PATH)) {
  console.error('compare-baseline: missing', CURRENT_PATH);
  process.exit(ci ? 1 : 0);
}

if (!existsSync(BASELINE_PATH)) {
  console.warn('compare-baseline: no baseline at', BASELINE_PATH, '— skipping');
  process.exit(0);
}

const current = JSON.parse(readFileSync(CURRENT_PATH, 'utf8'));
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const thresholds = JSON.parse(readFileSync(THRESHOLDS_PATH, 'utf8'));
const maxDrift = thresholds.regression?.maxP95DriftPercent ?? 20;

const baselineBySuite = new Map(
  (baseline.suites ?? []).map((s) => [s.suite, s]),
);

let failed = false;

for (const suite of current.suites ?? []) {
  const base = baselineBySuite.get(suite.suite);
  if (!base?.metrics?.httpReqDurationP95 || !suite.metrics?.httpReqDurationP95) {
    continue;
  }
  const baseP95 = base.metrics.httpReqDurationP95;
  const curP95 = suite.metrics.httpReqDurationP95;
  const drift = ((curP95 - baseP95) / baseP95) * 100;
  if (drift > maxDrift) {
    failed = true;
    console.error(
      `REGRESSION ${suite.suite}: p95 ${curP95.toFixed(1)}ms vs baseline ${baseP95.toFixed(1)}ms (+${drift.toFixed(1)}%)`,
    );
  }
}

if (failed && ci) {
  console.error(
    `compare-baseline: failed (max drift ${maxDrift}%). Update perf/baselines/summary.json if intentional.`,
  );
  process.exit(1);
}

console.log('compare-baseline: ok');
