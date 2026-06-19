import http from 'k6/http';
import { loadConfig, rampingStages } from './lib/config.js';
import { suiteThresholds, suiteConfig } from './lib/thresholds.js';
import { checkJsonArray } from './lib/checks.js';

const config = loadConfig();
const cfg = suiteConfig('editorQueue');

export const options = {
  scenarios: {
    editor_queue: rampingStages(cfg),
  },
  thresholds: suiteThresholds('editorQueue'),
};

export default function () {
  const res = http.get(`${config.baseUrl}/submissions`, {
    headers: {
      Authorization: `Bearer ${config.editorToken}`,
      Accept: 'application/json',
    },
    tags: { endpoint: 'editor_queue' },
  });
  checkJsonArray(res, 'submissions list');
}

export function handleSummary(data) {
  const out = {
    suite: 'editor-queue',
    startedAt: new Date().toISOString(),
    passed: !Object.values(data.metrics ?? {}).some((m) =>
      Object.values(m.thresholds ?? {}).some((t) => t.ok === false),
    ),
    metrics: data.metrics,
    root_group: data.root_group,
  };
  return {
    stdout: JSON.stringify(out, null, 2),
    'reports/editor-queue.json': JSON.stringify(out),
  };
}
