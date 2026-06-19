import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERF_DIR = join(__dirname, '..');
const THRESHOLDS_JS = join(PERF_DIR, 'k6', 'lib', 'thresholds.js');

test('generate-k6-thresholds produces importable module', () => {
  const result = spawnSync('node', [join(__dirname, 'generate-k6-thresholds.mjs')], {
    cwd: join(PERF_DIR, '..'),
  });
  assert.equal(result.status, 0, result.stderr?.toString());
  assert.ok(existsSync(THRESHOLDS_JS));
  const content = readFileSync(THRESHOLDS_JS, 'utf8');
  assert.match(content, /export const k6Thresholds/);
  assert.match(content, /reviewSubmit/);
});
