/**
 * Concurrent write-under-read test.
 *
 * Two scenarios run simultaneously:
 *   concurrent_reads  — constant ramp of VUs hitting the editor queue list and
 *                       submission detail endpoints.
 *   concurrent_writes — ramp of VUs writing notification-read patches, which
 *                       trigger audit log inserts and touch the notifications table.
 *
 * The goal is to verify that sustained writes don't inflate read latency beyond
 * the normal P95 budget defined in thresholds.json.
 */
import http from 'k6/http';
import { check } from 'k6';
import { loadConfig } from './lib/config.js';
import { suiteThresholds, suiteConfig } from './lib/thresholds.js';
import { checkJsonArray, checkJsonObject } from './lib/checks.js';

const config = loadConfig();
const cfg = suiteConfig('writeReadConcurrent');
const slugs = config.editorQueueSlugs ?? [];

const readerVus = parseInt(__ENV.PERF_READER_VUS || String(cfg.readerVus || 15), 10);
const writerVus = parseInt(__ENV.PERF_WRITER_VUS || String(cfg.writerVus || 8), 10);
const rampUp = cfg.rampUpSeconds ?? 20;
const sustain = cfg.sustainSeconds ?? 90;
const rampDown = cfg.rampDownSeconds ?? 10;

const rampStages = (target) => [
  { duration: `${rampUp}s`, target },
  { duration: `${sustain}s`, target },
  { duration: `${rampDown}s`, target: 0 },
];

export const options = {
  scenarios: {
    concurrent_reads: {
      executor: 'ramping-vus',
      stages: rampStages(readerVus),
      gracefulRampDown: `${rampDown}s`,
      exec: 'readWorkload',
    },
    concurrent_writes: {
      executor: 'ramping-vus',
      stages: rampStages(writerVus),
      gracefulRampDown: `${rampDown}s`,
      exec: 'writeWorkload',
    },
  },
  thresholds: suiteThresholds('writeReadConcurrent'),
};

// Pre-fetch notification IDs once so writers don't need a list call per iteration.
export function setup() {
  const res = http.get(`${config.baseUrl}/notifications?limit=20`, {
    headers: {
      Authorization: `Bearer ${config.editorToken}`,
      Accept: 'application/json',
    },
  });
  try {
    const items = res.json()?.items ?? [];
    return { notifIds: items.map((i) => i.id).filter(Boolean) };
  } catch {
    return { notifIds: [] };
  }
}

export function readWorkload() {
  const pick = (__VU + __ITER) % 2;
  if (pick === 0) {
    const res = http.get(`${config.baseUrl}/submissions`, {
      headers: {
        Authorization: `Bearer ${config.editorToken}`,
        Accept: 'application/json',
      },
      tags: { endpoint: 'wrc_read' },
    });
    checkJsonArray(res, 'editor queue under write load');
  } else if (slugs.length > 0) {
    const slug = slugs[(__VU + __ITER) % slugs.length];
    const res = http.get(`${config.baseUrl}/submissions/${slug}`, {
      headers: {
        Authorization: `Bearer ${config.editorToken}`,
        Accept: 'application/json',
      },
      tags: { endpoint: 'wrc_read' },
    });
    checkJsonObject(res, 'submission detail under write load');
  }
}

export function writeWorkload(data) {
  if (!data.notifIds.length) {
    // Fallback when no notification IDs are available (e.g. empty DB).
    http.get(`${config.baseUrl}/notifications/unread-count`, {
      headers: {
        Authorization: `Bearer ${config.editorToken}`,
        Accept: 'application/json',
      },
      tags: { endpoint: 'wrc_write' },
    });
    return;
  }
  // Marking a notification as read is idempotent, so it is safe to cycle
  // through the same IDs across iterations without exhausting fixtures.
  const id = data.notifIds[(__VU + __ITER) % data.notifIds.length];
  const res = http.patch(`${config.baseUrl}/notifications/${id}/read`, null, {
    headers: {
      Authorization: `Bearer ${config.editorToken}`,
      Accept: 'application/json',
    },
    tags: { endpoint: 'wrc_write' },
  });
  check(res, { 'notification write 2xx': (r) => r.status >= 200 && r.status < 300 });
}

// Required by k6; both scenarios point to named exec functions above.
export default function () {}

export function handleSummary(data) {
  const out = {
    suite: 'write-read-concurrent',
    startedAt: new Date().toISOString(),
    passed: !Object.values(data.metrics ?? {}).some((m) =>
      Object.values(m.thresholds ?? {}).some((t) => t.ok === false),
    ),
    metrics: data.metrics,
    root_group: data.root_group,
  };
  return {
    stdout: JSON.stringify(out, null, 2),
    'reports/write-read-concurrent.json': JSON.stringify(out),
  };
}
