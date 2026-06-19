/**
 * Aggregate perf/reports/*.json into perf/reports/summary.json
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(__dirname, '..', 'reports');
const SUMMARY_PATH = join(REPORTS_DIR, 'summary.json');

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function extractP95(metrics, key) {
  const m = metrics?.[key];
  if (!m?.values?.['p(95)']) return null;
  return m.values['p(95)'];
}

function suitePassed(data) {
  if (data?.passed === false) return false;
  if (data?.root_group?.checks) {
    for (const c of Object.values(data.root_group.checks)) {
      if (c.fails > 0) return false;
    }
  }
  return true;
}

const files = existsSync(REPORTS_DIR)
  ? readdirSync(REPORTS_DIR).filter((f) => f.endsWith('.json') && f !== 'summary.json')
  : [];

const suites = [];
let allPassed = true;

for (const file of files) {
  const data = readJson(join(REPORTS_DIR, file));
  if (!data) continue;

  const suiteName = data.suite ?? file.replace(/\.json$/, '');
  const passed = suitePassed(data);
  if (!passed) allPassed = false;

  suites.push({
    suite: suiteName,
    file,
    passed,
    startedAt: data.startedAt ?? null,
    metrics: {
      httpReqDurationP95: extractP95(data.metrics, 'http_req_duration'),
      httpReqFailedRate: data.metrics?.http_req_failed?.values?.rate ?? null,
    },
    database: data.database ?? null,
  });
}

const pgStat = readJson(join(REPORTS_DIR, 'pg-stat.json'));
if (pgStat?.passed === false) allPassed = false;

const summary = {
  generatedAt: new Date().toISOString(),
  passed: allPassed,
  suiteCount: suites.length,
  suites,
  database: pgStat ?? null,
};

writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
console.log(`Wrote ${SUMMARY_PATH} (passed=${allPassed})`);
if (!allPassed) process.exit(1);
