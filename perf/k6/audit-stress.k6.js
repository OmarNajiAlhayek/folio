import http from 'k6/http';
import { loadConfig, rampingStages } from './lib/config.js';
import { suiteThresholds, suiteConfig } from './lib/thresholds.js';
import { checkJsonArray } from './lib/checks.js';

const config = loadConfig();
const cfg = suiteConfig('auditStress');

export const options = {
  scenarios: {
    audit_stress: rampingStages(cfg),
  },
  thresholds: suiteThresholds('auditStress'),
};

function authHeaders() {
  return {
    Authorization: `Bearer ${config.editorToken}`,
    Accept: 'application/json',
  };
}

export default function () {
  // Rotate across reads and a write (25% write) to exercise audit log inserts alongside reads.
  const idx = (__VU + __ITER) % 4;

  if (idx === 0) {
    const res = http.get(`${config.baseUrl}/submissions`, {
      headers: authHeaders(),
      tags: { endpoint: 'audit_stress' },
    });
    checkJsonArray(res, 'list ok');
  } else if (idx === 1) {
    http.get(`${config.baseUrl}/notifications/unread-count`, {
      headers: authHeaders(),
      tags: { endpoint: 'audit_stress' },
    });
  } else if (idx === 2) {
    http.get(`${config.baseUrl}/auth/me`, {
      headers: authHeaders(),
      tags: { endpoint: 'audit_stress' },
    });
  } else {
    // Write path: list notifications then mark the first one read to trigger an audit log insert.
    const listRes = http.get(`${config.baseUrl}/notifications?limit=5`, {
      headers: authHeaders(),
      tags: { endpoint: 'audit_stress' },
    });
    try {
      const items = listRes.json()?.items;
      if (Array.isArray(items) && items[0]?.id) {
        http.patch(`${config.baseUrl}/notifications/${items[0].id}/read`, null, {
          headers: authHeaders(),
          tags: { endpoint: 'audit_stress' },
        });
      }
    } catch {
      // ignore parse errors in perf
    }
  }
}

export function handleSummary(data) {
  const out = {
    suite: 'audit-stress',
    startedAt: new Date().toISOString(),
    passed: !Object.values(data.metrics ?? {}).some((m) =>
      Object.values(m.thresholds ?? {}).some((t) => t.ok === false),
    ),
    metrics: data.metrics,
    root_group: data.root_group,
  };
  return {
    stdout: JSON.stringify(out, null, 2),
    'reports/audit-stress.json': JSON.stringify(out),
  };
}
