import { config } from 'dotenv';
import pg from 'pg';

config({ quiet: true });

const API = 'http://127.0.0.1:5243/api/v1';
const KEYS = [
  'reviewer-invited',
  'reminder-due',
  'copyedit-assigned',
  'copyedit-queries-sent',
  'copyedit-author-ready',
  'submission-submitted',
  'submission-decision',
  'submission-under-review',
  'review-submitted',
  'review-invitation-accepted',
  'review-invitation-declined',
  'submission-published',
  'role-invitation',
];

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const session = await res.json();
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');
  return {
    status: res.status,
    code: session.code,
    headers: {
      cookie,
      'x-csrf-token': session.csrfToken || '',
      'content-type': 'application/json',
    },
  };
}

async function roundTrip(auth, key) {
  const got = await fetch(
    `${API}/admin/email/templates/${key}?locale=en`,
    { headers: auth.headers },
  );
  const tpl = await got.json();
  if (got.status !== 200) {
    return { key, get: got.status, code: tpl.code, message: tpl.message };
  }
  const mark = key === 'reviewer-invited';
  const subjectTemplate = mark
    ? `${tpl.subjectTemplate} QA`
    : tpl.subjectTemplate;
  const patched = await fetch(
    `${API}/admin/email/templates/${key}?locale=en`,
    {
      method: 'PATCH',
      headers: auth.headers,
      body: JSON.stringify({
        subjectTemplate,
        htmlBody: tpl.htmlBody,
        textBody: tpl.textBody,
        expectedUpdatedAt: tpl.updatedAt,
      }),
    },
  );
  const saved = await patched.json();
  if (patched.status !== 200) {
    return {
      key,
      patch: patched.status,
      code: saved.code,
      message: saved.message,
    };
  }
  let preview = null;
  if (mark) {
    const previewRes = await fetch(
      `${API}/admin/email/templates/${key}/preview?locale=en`,
      { method: 'POST', headers: auth.headers, body: '{}' },
    );
    const rendered = await previewRes.json();
    preview = {
      status: previewRes.status,
      endsWithQA: String(rendered.subject || '').endsWith('QA'),
    };
    const restored = await fetch(
      `${API}/admin/email/templates/${key}?locale=en`,
      {
        method: 'PATCH',
        headers: auth.headers,
        body: JSON.stringify({
          subjectTemplate: tpl.subjectTemplate,
          htmlBody: tpl.htmlBody,
          textBody: tpl.textBody,
          expectedUpdatedAt: saved.updatedAt,
        }),
      },
    );
    return { key, patch: 200, preview, restore: restored.status };
  }
  return { key, patch: 200 };
}

const manager = await login('manager@folio.local', 'Manager123!');
console.log('login', manager.status, manager.code || 'ok');
if (manager.status !== 200) process.exit(1);

for (const key of KEYS) {
  console.log(JSON.stringify(await roundTrip(manager, key)));
}

const policyRes = await fetch(`${API}/admin/email/reminder-policy`, {
  headers: manager.headers,
});
const policy = await policyRes.json();
const policyPatch = await fetch(`${API}/admin/email/reminder-policy`, {
  method: 'PATCH',
  headers: manager.headers,
  body: JSON.stringify({
    reviewDueInDays: policy.reviewDueInDays,
    expectedUpdatedAt: policy.updatedAt,
  }),
});
console.log('policy', policyRes.status, 'save', policyPatch.status, 'days', policy.reviewDueInDays);

const pipe = await fetch(`${API}/admin/email/pipeline-status`, {
  headers: manager.headers,
});
const pipeline = await pipe.json();
console.log(
  'pipeline',
  pipe.status,
  'worker',
  pipeline.emailWorker?.available,
  'rabbit',
  pipeline.rabbitMq?.available,
  'pendingOutbox',
  pipeline.outbox?.pending,
  'publishedOutbox',
  pipeline.outbox?.published,
);

const db = new pg.Client({
  host: process.env.DB_HOST || 'localhost',
  port: 5432,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: 'folio_email',
});
await db.connect();
const templates = await db.query(
  `SELECT template, status, count(*)::int AS n
     FROM email.email_log
    GROUP BY template, status
    ORDER BY template, status`,
);
console.log('email_log');
for (const row of templates.rows) {
  console.log(`  ${row.status} ${row.template} ${row.n}`);
}
const reminders = await db.query(
  `SELECT status, count(*)::int AS n
     FROM email.reminder
    GROUP BY status
    ORDER BY status`,
);
console.log('reminders', reminders.rows);
const pending = await db.query(
  `SELECT id, kind, send_at
     FROM email.reminder
    WHERE status = 'pending'
    ORDER BY send_at
    LIMIT 1`,
);
if (pending.rows[0]) {
  const id = pending.rows[0].id;
  await db.query(
    `UPDATE email.reminder
        SET send_at = now() - interval '1 minute',
            picked_at = NULL
      WHERE id = $1 AND status = 'pending'`,
    [id],
  );
  console.log('forced reminder', id, pending.rows[0].kind);
} else {
  console.log('no pending reminder');
}
await db.end();
