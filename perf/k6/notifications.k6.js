import http from 'k6/http';
import { check } from 'k6';
import { loadConfig, rampingStages } from './lib/config.js';
import { suiteThresholds, suiteConfig } from './lib/thresholds.js';
import { checkJsonListResult } from './lib/checks.js';

const config = loadConfig();
const cfg = suiteConfig('notifications');

export const options = {
  scenarios: {
    notifications: rampingStages(cfg),
  },
  thresholds: suiteThresholds('notifications'),
};

function authHeaders() {
  return {
    Authorization: `Bearer ${config.editorToken}`,
    Accept: 'application/json',
  };
}

export default function () {
  const listRes = http.get(`${config.baseUrl}/notifications?limit=20`, {
    headers: authHeaders(),
    tags: { endpoint: 'notifications' },
  });
  checkJsonListResult(listRes, 'notifications list');

  const countRes = http.get(`${config.baseUrl}/notifications/unread-count`, {
    headers: authHeaders(),
    tags: { endpoint: 'notifications' },
  });
  check(countRes, {
    'unread count 2xx': (r) => r.status >= 200 && r.status < 300,
  });

  try {
    const body = listRes.json();
    const items = body?.items;
    if (Array.isArray(items) && items.length > 0 && items[0]?.id) {
      http.patch(`${config.baseUrl}/notifications/${items[0].id}/read`, null, {
        headers: authHeaders(),
        tags: { endpoint: 'notifications' },
      });
    }
  } catch {
    // ignore parse errors in perf
  }
}

export function handleSummary(data) {
  const out = {
    suite: 'notifications',
    startedAt: new Date().toISOString(),
    passed: !Object.values(data.metrics ?? {}).some((m) =>
      Object.values(m.thresholds ?? {}).some((t) => t.ok === false),
    ),
    metrics: data.metrics,
    root_group: data.root_group,
  };
  return {
    stdout: JSON.stringify(out, null, 2),
    'reports/notifications.json': JSON.stringify(out),
  };
}
