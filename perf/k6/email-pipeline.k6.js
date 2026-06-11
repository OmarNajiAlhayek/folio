import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { loadConfig } from './lib/config.js';

const drainSeconds = new Trend('email_pipeline_drain_seconds', true);
const throughput = new Trend('email_pipeline_throughput_per_sec', true);
const invitesSent = new Counter('email_pipeline_invites_sent');

const config = loadConfig();
const invites = config.emailPipeline?.invites ?? [];
const inviteCount = parseInt(
  __ENV.PERF_EMAIL_INVITES || String(invites.length || 50),
  10,
);
const batch = invites.slice(0, inviteCount);

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    email_pipeline_drain_seconds: ['max<120'],
    email_pipeline_throughput_per_sec: ['min>0.3'],
  },
};

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function getOutboxPending() {
  const res = http.get(`${config.baseUrl}/health/outbox`, {
    tags: { endpoint: 'outbox_health' },
  });
  if (res.status !== 200) return null;
  try {
    return res.json().pending;
  } catch {
    return null;
  }
}

function getEmailLogSent() {
  const res = http.get(`${config.baseUrl}/admin/email/pipeline-status`, {
    headers: authHeaders(config.managerToken),
    tags: { endpoint: 'pipeline_status' },
  });
  if (res.status !== 200) return null;
  try {
    const body = res.json();
    return body?.emailLog?.counts?.sent ?? null;
  } catch {
    return null;
  }
}

export default function () {
  if (!batch.length) {
    throw new Error(
      'perf config has no email invites — run seed:perf and perf/setup.mjs',
    );
  }

  const baselineSent = getEmailLogSent() ?? 0;
  const start = Date.now();

  const requests = batch.map((invite) => ({
    method: 'POST',
    url: `${config.baseUrl}/submissions/${invite.submissionSlug}/assignments`,
    body: JSON.stringify({ reviewerId: invite.reviewerId }),
    params: {
      headers: authHeaders(config.editorToken),
      tags: { endpoint: 'assign_reviewer' },
    },
  }));

  const responses = http.batch(requests);
  let okCount = 0;
  for (const res of responses) {
    if (res.status === 200 || res.status === 201) {
      okCount += 1;
      invitesSent.add(1);
    }
  }

  check(null, {
    'all invites accepted': () => okCount === batch.length,
  });

  const deadline = Date.now() + 120_000;
  let drained = false;
  while (Date.now() < deadline) {
    const pending = getOutboxPending();
    const sent = getEmailLogSent();
    if (pending === 0 && sent !== null && sent >= baselineSent + okCount) {
      drained = true;
      break;
    }
    sleep(2);
  }

  const elapsedSec = (Date.now() - start) / 1000;
  drainSeconds.add(elapsedSec);
  if (elapsedSec > 0) {
    throughput.add(okCount / elapsedSec);
  }

  check(null, {
    'pipeline drained in time': () => drained,
  });
}

export function handleSummary(data) {
  const out = {
    suite: 'email-pipeline',
    inviteCount: batch.length,
    metrics: data.metrics,
    root_group: data.root_group,
  };
  return {
    stdout: JSON.stringify(out, null, 2),
    'reports/email-pipeline.json': JSON.stringify(out),
  };
}
