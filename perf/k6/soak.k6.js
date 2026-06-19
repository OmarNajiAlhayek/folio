import http from 'k6/http';
import { sleep } from 'k6';
import { loadConfig } from './lib/config.js';
import { suiteThresholds, suiteConfig } from './lib/thresholds.js';
import { checkJsonArray } from './lib/checks.js';

const config = loadConfig();
const cfg = suiteConfig('soak');
const durationMin = parseInt(__ENV.PERF_SOAK_MINUTES || String(cfg.durationMinutes || 30), 10);

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-arrival-rate',
      rate: cfg.arrivalRatePerSecond || 5,
      timeUnit: '1s',
      duration: `${durationMin}m`,
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
  thresholds: suiteThresholds('soak'),
};

// Pre-fetch notification IDs once so the write path doesn't need a list call per iteration.
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

export default function (data) {
  const pick = Math.random();

  if (pick < 0.35) {
    // Read: editor queue list (hits submissions table)
    const res = http.get(`${config.baseUrl}/submissions`, {
      headers: {
        Authorization: `Bearer ${config.editorToken}`,
        Accept: 'application/json',
      },
      tags: { endpoint: 'soak' },
    });
    checkJsonArray(res, 'editor list');
  } else if (pick < 0.65) {
    // Read: public catalog (unauthenticated, exercises search path)
    http.get(`${config.baseUrl}/public/submissions?limit=10`, {
      headers: { Accept: 'application/json' },
      tags: { endpoint: 'soak' },
    });
  } else if (pick < 0.85) {
    // Read: notification unread count
    http.get(`${config.baseUrl}/notifications/unread-count`, {
      headers: {
        Authorization: `Bearer ${config.editorToken}`,
        Accept: 'application/json',
      },
      tags: { endpoint: 'soak' },
    });
  } else if (data.notifIds.length > 0) {
    // Write (15%): mark a notification read — exercises audit log inserts under sustained load.
    const id = data.notifIds[(__VU + __ITER) % data.notifIds.length];
    http.patch(`${config.baseUrl}/notifications/${id}/read`, null, {
      headers: {
        Authorization: `Bearer ${config.editorToken}`,
        Accept: 'application/json',
      },
      tags: { endpoint: 'soak' },
    });
  } else {
    // Fallback if no notification IDs available
    http.get(`${config.baseUrl}/notifications/unread-count`, {
      headers: {
        Authorization: `Bearer ${config.editorToken}`,
        Accept: 'application/json',
      },
      tags: { endpoint: 'soak' },
    });
  }

  sleep(0.05);
}

export function handleSummary(data) {
  const out = {
    suite: 'soak',
    startedAt: new Date().toISOString(),
    passed: !Object.values(data.metrics ?? {}).some((m) =>
      Object.values(m.thresholds ?? {}).some((t) => t.ok === false),
    ),
    metrics: data.metrics,
    root_group: data.root_group,
  };
  return {
    stdout: JSON.stringify(out, null, 2),
    'reports/soak.json': JSON.stringify(out),
  };
}
