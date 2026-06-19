import http from 'k6/http';
import { loadConfig, rampingStages } from './lib/config.js';
import { suiteThresholds, suiteConfig } from './lib/thresholds.js';
import { checkJsonObject } from './lib/checks.js';

const config = loadConfig();
const cfg = suiteConfig('submissionDetail');
const slugs = config.editorQueueSlugs ?? [];

export const options = {
  scenarios: {
    submission_detail: rampingStages(cfg),
  },
  thresholds: suiteThresholds('submissionDetail'),
};

export default function () {
  if (!slugs.length) {
    throw new Error('perf config has no editorQueueSlugs — run seed:perf');
  }
  const slug = slugs[(__VU + __ITER) % slugs.length];
  const res = http.get(`${config.baseUrl}/submissions/${slug}`, {
    headers: {
      Authorization: `Bearer ${config.editorToken}`,
      Accept: 'application/json',
    },
    tags: { endpoint: 'submission_detail' },
  });
  checkJsonObject(res, 'submission detail');
}

export function handleSummary(data) {
  const out = {
    suite: 'submission-detail',
    startedAt: new Date().toISOString(),
    passed: !Object.values(data.metrics ?? {}).some((m) =>
      Object.values(m.thresholds ?? {}).some((t) => t.ok === false),
    ),
    metrics: data.metrics,
    root_group: data.root_group,
  };
  return {
    stdout: JSON.stringify(out, null, 2),
    'reports/submission-detail.json': JSON.stringify(out),
  };
}
