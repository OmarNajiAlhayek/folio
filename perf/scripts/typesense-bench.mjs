/**
 * Direct Typesense search benchmark (when TYPESENSE_ENABLED=true).
 *
 * Fires requests in batches of `concurrency` (default 5) so that actual
 * concurrent throughput is measured rather than sequential latency.
 * Each individual request's RTT is recorded for P95 calculation.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERF_DIR = join(__dirname, '..');
const THRESHOLDS_PATH = join(PERF_DIR, 'thresholds.json');
const REPORTS_DIR = join(PERF_DIR, 'reports');
const OUTPUT_PATH = join(REPORTS_DIR, 'typesense.json');

const thresholds = JSON.parse(readFileSync(THRESHOLDS_PATH, 'utf8'));
const cfg = thresholds.typesense ?? {};
const ci = process.argv.includes('--ci');

const host = process.env.TYPESENSE_HOST ?? 'localhost';
const port = process.env.TYPESENSE_PORT ?? '8108';
const apiKey = process.env.TYPESENSE_API_KEY ?? '';
const collection = process.env.TYPESENSE_COLLECTION ?? 'submissions';
const baseUrl = `http://${host}:${port}`;
const terms = ['education', 'research', 'journal', 'machine', 'peer'];

// Number of requests to fire in parallel per tick.
const concurrency = cfg.concurrency ?? 5;

async function search(q) {
  const start = performance.now();
  const url = `${baseUrl}/collections/${collection}/documents/search?q=${encodeURIComponent(q)}&query_by=title,abstract&per_page=20`;
  const res = await fetch(url, {
    headers: { 'X-TYPESENSE-API-KEY': apiKey },
  });
  const ms = performance.now() - start;
  if (!res.ok) {
    throw new Error(`Typesense search failed: ${res.status}`);
  }
  return ms;
}

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length) - 1));
  return sorted[idx];
}

async function main() {
  if (process.env.TYPESENSE_ENABLED?.toLowerCase() !== 'true') {
    console.log('typesense-bench: skipped (TYPESENSE_ENABLED != true)');
    return;
  }

  mkdirSync(REPORTS_DIR, { recursive: true });

  const durationSec = cfg.durationSeconds ?? 30;
  const targetRps = cfg.rps ?? 50;
  // Fire `concurrency` requests at once, then wait so that the overall rate
  // averages to targetRps.  This actually exercises Typesense under parallel load.
  const batchIntervalMs = (concurrency * 1000) / targetRps;
  const end = Date.now() + durationSec * 1000;
  const durations = [];
  let errors = 0;

  while (Date.now() < end) {
    const batch = Array.from({ length: concurrency }, () => {
      const q = terms[Math.floor(Math.random() * terms.length)];
      return search(q)
        .then((ms) => ({ ok: true, ms }))
        .catch(() => {
          errors += 1;
          return { ok: false };
        });
    });

    const results = await Promise.all(batch);
    for (const r of results) {
      if (r.ok) durations.push(r.ms);
    }

    await new Promise((resolve) => setTimeout(resolve, batchIntervalMs));
  }

  durations.sort((a, b) => a - b);
  const p95 = durations.length ? percentile(durations, 0.95) : null;
  const passed = errors === 0 && p95 !== null && p95 <= (cfg.searchP95Ms ?? 100);

  const out = {
    suite: 'typesense',
    startedAt: new Date().toISOString(),
    passed,
    sampleCount: durations.length,
    concurrency,
    errors,
    p95Ms: p95,
    thresholdP95Ms: cfg.searchP95Ms ?? 100,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUTPUT_PATH} (passed=${passed}, p95=${p95?.toFixed(1)}ms, concurrency=${concurrency})`);
  if (ci && !passed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(ci ? 1 : 0);
});
