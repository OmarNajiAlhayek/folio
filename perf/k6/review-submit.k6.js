import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { loadConfig } from './lib/config.js';
import { suiteThresholds, suiteConfig } from './lib/thresholds.js';
import { checkJsonObject } from './lib/checks.js';

const reviewDuration = new Trend('review_submit_duration', true);

const config = loadConfig();
const cfg = suiteConfig('reviewSubmit');
const reviewers = config.reviewers ?? [];
const slugs = config.editorQueueSlugs ?? [];

const vuCount = Math.min(
  parseInt(__ENV.PERF_VUS || String(reviewers.length || cfg.vus || 20), 10),
  reviewers.length || 1,
);
// Read VUs run concurrently with writers to detect write-induced read latency regressions.
const readVus = Math.max(3, Math.floor(vuCount / 3));

export const options = {
  scenarios: {
    // Burst of concurrent writes: each VU submits exactly one review.
    review_write: {
      executor: 'per-vu-iterations',
      vus: vuCount,
      iterations: 1,
      maxDuration: '3m',
      exec: 'submitReview',
      startTime: '0s',
    },
    // Sustained reads run alongside the writes to measure latency under write pressure.
    review_read: {
      executor: 'constant-vus',
      vus: readVus,
      duration: '90s',
      exec: 'readSubmission',
      startTime: '0s',
    },
  },
  thresholds: suiteThresholds('reviewSubmit'),
};

export function submitReview() {
  if (!reviewers.length) {
    throw new Error('perf config has no reviewers — run perf/setup.mjs after seed:perf');
  }

  const entry = reviewers[(__VU - 1) % reviewers.length];
  const payload = JSON.stringify({
    recommendation: 'accept',
    commentsForAuthor: `Perf review from VU ${__VU} iter ${__ITER}`,
    commentsToEditorOnly: 'Confidential perf note.',
  });

  const res = http.post(
    `${config.baseUrl}/assignments/${entry.assignmentSlug}/reviews`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${entry.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      tags: { endpoint: 'review_submit' },
    },
  );

  reviewDuration.add(res.timings.duration);

  check(res, {
    'review submit 2xx': (r) => r.status === 200 || r.status === 201,
    'review has id': (r) => {
      try {
        const body = r.json();
        return Boolean(body?.id);
      } catch {
        return false;
      }
    },
  });
}

export function readSubmission() {
  if (!slugs.length) return;
  const slug = slugs[(__VU + __ITER) % slugs.length];
  const res = http.get(`${config.baseUrl}/submissions/${slug}`, {
    headers: {
      Authorization: `Bearer ${config.editorToken}`,
      Accept: 'application/json',
    },
    tags: { endpoint: 'review_read_detail' },
  });
  checkJsonObject(res, 'submission detail during write load');
}

// Required by k6; named scenarios use their own exec functions above.
export default function () {}

export function handleSummary(data) {
  const out = {
    suite: 'review-submit',
    startedAt: new Date().toISOString(),
    passed: true,
    metrics: data.metrics,
    root_group: data.root_group,
  };
  for (const t of Object.values(data.metrics ?? {})) {
    if (t.thresholds) {
      for (const th of Object.values(t.thresholds)) {
        if (th.ok === false) out.passed = false;
      }
    }
  }
  return {
    stdout: JSON.stringify(out, null, 2),
    'reports/review-submit.json': JSON.stringify(out),
  };
}
