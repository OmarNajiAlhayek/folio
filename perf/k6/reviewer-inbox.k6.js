import http from 'k6/http';
import { loadConfig, rampingStages } from './lib/config.js';
import { suiteThresholds, suiteConfig } from './lib/thresholds.js';
import { checkJsonArray } from './lib/checks.js';

const config = loadConfig();
const cfg = suiteConfig('reviewerInbox');
const reviewers = config.reviewers ?? [];

export const options = {
  scenarios: {
    reviewer_inbox: rampingStages(cfg),
  },
  thresholds: suiteThresholds('reviewerInbox'),
};

export default function () {
  if (!reviewers.length) {
    throw new Error('perf config has no reviewers');
  }
  const entry = reviewers[(__VU - 1) % reviewers.length];
  const res = http.get(`${config.baseUrl}/assignments/me`, {
    headers: {
      Authorization: `Bearer ${entry.token}`,
      Accept: 'application/json',
    },
    tags: { endpoint: 'reviewer_inbox' },
  });
  checkJsonArray(res, 'assignments list');
}

export function handleSummary(data) {
  const out = {
    suite: 'reviewer-inbox',
    startedAt: new Date().toISOString(),
    passed: !Object.values(data.metrics ?? {}).some((m) =>
      Object.values(m.thresholds ?? {}).some((t) => t.ok === false),
    ),
    metrics: data.metrics,
    root_group: data.root_group,
  };
  return {
    stdout: JSON.stringify(out, null, 2),
    'reports/reviewer-inbox.json': JSON.stringify(out),
  };
}
