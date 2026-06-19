import http from 'k6/http';
import { loadConfig, rampingStages } from './lib/config.js';
import { suiteThresholds, suiteConfig } from './lib/thresholds.js';
import { checkJsonObject } from './lib/checks.js';

const config = loadConfig();
const cfg = suiteConfig('publicSearch');
const terms = config.searchTerms ?? ['education', 'machine', 'research', 'journal', 'peer'];

export const options = {
  scenarios: {
    public_search: rampingStages(cfg),
  },
  thresholds: suiteThresholds('publicSearch'),
};

export default function () {
  const q = terms[(__VU + __ITER) % terms.length];
  const res = http.get(
    `${config.baseUrl}/public/submissions?q=${encodeURIComponent(q)}&limit=20`,
    {
      headers: { Accept: 'application/json' },
      tags: { endpoint: 'public_search' },
    },
  );
  checkJsonObject(res, 'search result object');
}

export function handleSummary(data) {
  const out = {
    suite: 'public-search',
    startedAt: new Date().toISOString(),
    passed: !Object.values(data.metrics ?? {}).some((m) =>
      Object.values(m.thresholds ?? {}).some((t) => t.ok === false),
    ),
    metrics: data.metrics,
    root_group: data.root_group,
  };
  return {
    stdout: JSON.stringify(out, null, 2),
    'reports/public-search.json': JSON.stringify(out),
  };
}
