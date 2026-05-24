/**
 * Demo: print pipeline-status, assign reviewer@folio.local on the seeded
 * "[SAMPLE] In editor queue" submission, wait for drainer, print again.
 *
 * Prefer **`demo-email-pipeline-v2.mjs`** — it skips manuscripts where that
 * reviewer is already assigned (avoids 400 Reviewer already assigned).
 *
 * Usage (PowerShell):
 *   $env:FOLIO_TOKEN="<paste editor JWT>"
 *   node backend/scripts/demo-email-pipeline.mjs
 *
 * Optional: $env:FOLIO_API_BASE="http://localhost:5243/api/v1"
 *
 * Do not commit real JWTs into this file.
 */

const BASE = process.env.FOLIO_API_BASE ?? 'http://localhost:5243/api/v1';
const TOKEN = process.env.FOLIO_TOKEN;

if (!TOKEN) {
  console.error('Missing FOLIO_TOKEN (editor JWT).');
  process.exit(1);
}

async function api(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!r.ok) {
    const err = new Error(`${r.status} ${path}`);
    err.body = body;
    throw err;
  }
  return body;
}

async function main() {
  console.log('--- GET /admin/email/pipeline-status (before) ---\n');
  console.log(JSON.stringify(await api('/admin/email/pipeline-status'), null, 2));

  const subs = await api('/submissions?status=submitted');
  if (!Array.isArray(subs)) {
    throw new Error('Unexpected /submissions response (expected array)');
  }
  const target = subs.find((s) =>
    String(s.title ?? '').includes('In editor queue'),
  );
  if (!target?.slug) {
    throw new Error(
      'No submission with title containing "In editor queue". Run npm run seed in backend/.',
    );
  }
  console.log('\n--- Assign reviewer ---');
  console.log('slug:', target.slug, '| title:', target.title);

  const candidates = await api('/users/reviewer-candidates');
  const reviewer = candidates.find(
    (c) => String(c.email ?? '').toLowerCase() === 'reviewer@folio.local',
  );
  if (!reviewer?.id) {
    throw new Error(
      'reviewer@folio.local not in /users/reviewer-candidates (willingToReview + reviewer role?).',
    );
  }
  console.log('reviewerId:', reviewer.id);

  const assignRes = await fetch(
    `${BASE}/submissions/${encodeURIComponent(target.slug)}/assignments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reviewerId: reviewer.id }),
    },
  );
  const assignText = await assignRes.text();
  let assignBody;
  try {
    assignBody = JSON.parse(assignText);
  } catch {
    assignBody = assignText;
  }
  console.log('POST /assignments status:', assignRes.status);
  console.log(JSON.stringify(assignBody, null, 2));
  if (!assignRes.ok) {
    process.exit(1);
  }

  const waitMs = Number(process.env.FOLIO_WAIT_MS ?? 12_000);
  console.log(`\nWaiting ${waitMs}ms for outbox drainer + email-service…`);
  await new Promise((r) => setTimeout(r, waitMs));

  console.log('\n--- GET /admin/email/pipeline-status (after) ---\n');
  console.log(JSON.stringify(await api('/admin/email/pipeline-status'), null, 2));
}

main().catch((e) => {
  if (e.body !== undefined) {
    console.error(JSON.stringify(e.body, null, 2));
  }
  console.error(e.message ?? e);
  process.exit(1);
});
