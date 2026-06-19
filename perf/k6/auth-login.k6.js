import http from 'k6/http';
import { check } from 'k6';
import { loadConfig, rampingStages } from './lib/config.js';
import { suiteThresholds, suiteConfig } from './lib/thresholds.js';

const config = loadConfig();
const cfg = suiteConfig('authLogin');
const accounts = config.authAccounts ?? [];

export const options = {
  scenarios: {
    auth_login: rampingStages(cfg),
  },
  thresholds: suiteThresholds('authLogin'),
};

export default function () {
  if (!accounts.length) {
    throw new Error('perf config has no authAccounts — run perf/setup.mjs');
  }
  const account = accounts[(__VU - 1) % accounts.length];
  const res = http.post(
    `${config.baseUrl}/auth/login`,
    JSON.stringify({ email: account.email, password: account.password }),
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      tags: { endpoint: 'auth_login' },
    },
  );
  check(res, {
    'login 2xx': (r) => r.status === 200 || r.status === 201,
    'has accessToken': (r) => {
      try {
        return Boolean(r.json()?.accessToken);
      } catch {
        return false;
      }
    },
  });
}

export function handleSummary(data) {
  const out = {
    suite: 'auth-login',
    startedAt: new Date().toISOString(),
    passed: !Object.values(data.metrics ?? {}).some((m) =>
      Object.values(m.thresholds ?? {}).some((t) => t.ok === false),
    ),
    metrics: data.metrics,
    root_group: data.root_group,
  };
  return {
    stdout: JSON.stringify(out, null, 2),
    'reports/auth-login.json': JSON.stringify(out),
  };
}
