import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { loadConfig } from './lib/config.js';

const reviewDuration = new Trend('review_submit_duration', true);

const config = loadConfig();
const reviewers = config.reviewers ?? [];
const vuCount = Math.min(
  parseInt(__ENV.PERF_VUS || String(reviewers.length || 20), 10),
  reviewers.length || 1,
);

export const options = {
  scenarios: {
    review_submit: {
      executor: 'per-vu-iterations',
      vus: vuCount,
      iterations: 1,
      maxDuration: '3m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:review_submit}': ['p(95)<2000', 'p(99)<5000'],
    checks: ['rate>0.99'],
  },
};

export default function () {
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

export function handleSummary(data) {
  const out = {
    suite: 'review-submit',
    metrics: data.metrics,
    root_group: data.root_group,
  };
  return {
    stdout: JSON.stringify(out, null, 2),
    'reports/review-submit.json': JSON.stringify(out),
  };
}
