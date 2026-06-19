import http from 'k6/http';
import { check, sleep } from 'k6';
import { loadConfig } from './lib/config.js';
import { suiteThresholds, suiteConfig } from './lib/thresholds.js';
import { checkJsonArray } from './lib/checks.js';

const config = loadConfig();
const cfg = suiteConfig('poolStress');
const poolMax = parseInt(__ENV.DB_POOL_MAX || '30', 10);
const reviewers = config.reviewers ?? [];

export const options = {
  scenarios: {
    // Flood the server with poolMax+10 VUs to force connection pool saturation.
    pool_stress: {
      executor: 'constant-vus',
      vus: poolMax + 10,
      duration: '60s',
      startTime: '0s',
    },
    // After the flood ends, verify the pool drains and normal requests succeed within budget.
    pool_recovery: {
      executor: 'per-vu-iterations',
      vus: 3,
      iterations: 5,
      maxDuration: '30s',
      startTime: '65s',
      exec: 'recoveryCheck',
    },
  },
  thresholds: suiteThresholds('poolStress'),
};

export default function () {
  if (__ITER % 2 === 0) {
    const res = http.get(`${config.baseUrl}/submissions`, {
      headers: {
        Authorization: `Bearer ${config.editorToken}`,
        Accept: 'application/json',
      },
      tags: { endpoint: 'pool_stress_read' },
    });
    checkJsonArray(res, 'editor list');
  } else if (reviewers.length > 0) {
    const entry = reviewers[(__VU - 1) % reviewers.length];
    const res = http.get(`${config.baseUrl}/assignments/me`, {
      headers: {
        Authorization: `Bearer ${entry.token}`,
        Accept: 'application/json',
      },
      tags: { endpoint: 'pool_stress_read' },
    });
    check(res, { 'inbox 2xx': (r) => r.status >= 200 && r.status < 300 });
  }
  sleep(0.1);
}

export function recoveryCheck() {
  const res = http.get(`${config.baseUrl}/submissions`, {
    headers: {
      Authorization: `Bearer ${config.editorToken}`,
      Accept: 'application/json',
    },
    tags: { endpoint: 'pool_recovery' },
  });
  check(res, { 'recovery 2xx': (r) => r.status >= 200 && r.status < 300 });
}

export function handleSummary(data) {
  const out = {
    suite: 'pool-stress',
    startedAt: new Date().toISOString(),
    passed: !Object.values(data.metrics ?? {}).some((m) =>
      Object.values(m.thresholds ?? {}).some((t) => t.ok === false),
    ),
    metrics: data.metrics,
    root_group: data.root_group,
  };
  return {
    stdout: JSON.stringify(out, null, 2),
    'reports/pool-stress.json': JSON.stringify(out),
  };
}
