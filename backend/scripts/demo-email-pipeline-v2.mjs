/**
 * Scenario: exercise assign → outbox → email pipeline without double-assign.
 *
 * 1. GET /admin/email/pipeline-status (before)
 * 2. Resolve reviewer from GET /users/reviewer-candidates (default
 *    reviewer@folio.local; override with FOLIO_REVIEWER_EMAIL)
 * 3. GET /submissions?status=submitted
 * 4. For each submission: GET /submissions/:slug/assignments — skip if that
 *    reviewer already has invited or accepted
 * 5. POST assign on first eligible slug — expect 201
 * 6. Sleep FOLIO_WAIT_MS (default 15000)
 * 7. GET /admin/email/pipeline-status (after) + reminder for COUNT(*) checks
 *
 * PowerShell:
 *   $env:FOLIO_TOKEN="<editor JWT>"
 *   node backend/scripts/demo-email-pipeline-v2.mjs
 *
 * Optional:
 *   $env:FOLIO_API_BASE="http://localhost:5243/api/v1"
 *   $env:FOLIO_REVIEWER_EMAIL="reviewer@folio.local"
 *   $env:FOLIO_WAIT_MS="15000"
 *   $env:FOLIO_TRY_OTHER_REVIEWERS="1" — if the preferred email is already
 *     invited/accepted on every submitted manuscript, try other candidates
 *     from the same GET (e.g. seeded editor@folio.local also has reviewer+willing).
 *
 * Prerequisites: RabbitMQ, backend, email-service, same DB, npm run seed.
 */

const BASE = process.env.FOLIO_API_BASE ?? 'http://localhost:5243/api/v1';
const TOKEN = process.env.FOLIO_TOKEN;
const REVIEWER_EMAIL = (
  process.env.FOLIO_REVIEWER_EMAIL ?? 'reviewer@folio.local'
).toLowerCase();
const WAIT_MS = Number(process.env.FOLIO_WAIT_MS ?? 15_000);
const TRY_OTHER_REVIEWERS =
  process.env.FOLIO_TRY_OTHER_REVIEWERS === '1' ||
  process.env.FOLIO_TRY_OTHER_REVIEWERS === 'true';

const ACTIVE = new Set(['invited', 'accepted']);

if (!TOKEN) {
  console.error('Set FOLIO_TOKEN to an editor JWT.');
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
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function tryAssign(slug, reviewerId) {
  const r = await fetch(
    `${BASE}/submissions/${encodeURIComponent(slug)}/assignments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reviewerId }),
    },
  );
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: r.status, body };
}

function reviewerAlreadyActive(assignments, reviewerId) {
  if (!Array.isArray(assignments)) return false;
  return assignments.some((a) => {
    const rid = a.reviewerId;
    const same =
      rid === reviewerId ||
      String(rid ?? '') === String(reviewerId ?? '');
    return (
      same &&
      a.status &&
      ACTIVE.has(String(a.status).toLowerCase())
    );
  });
}

/** Preferred reviewer first; optionally append other candidates (deduped by id). */
function buildReviewerOrder(candidates, preferredEmail, tryOthers) {
  if (!Array.isArray(candidates)) {
    throw new Error('Unexpected /users/reviewer-candidates (expected array)');
  }
  const primary = candidates.find(
    (c) => String(c.email ?? '').toLowerCase() === preferredEmail,
  );
  const out = [];
  const seen = new Set();
  const push = (c) => {
    if (c?.id && !seen.has(c.id)) {
      seen.add(c.id);
      out.push(c);
    }
  };
  if (primary) {
    push(primary);
  } else if (!tryOthers) {
    throw new Error(
      `${preferredEmail} not in /users/reviewer-candidates (reviewer role + willingToReview).`,
    );
  }
  if (tryOthers) {
    for (const c of candidates) {
      push(c);
    }
  }
  return out;
}

async function main() {
  console.log('GET /admin/email/pipeline-status (before)\n');
  console.log(JSON.stringify(await api('/admin/email/pipeline-status'), null, 2));

  console.log('\nGET /users/reviewer-candidates');
  const candidates = await api('/users/reviewer-candidates');
  const reviewerOrder = buildReviewerOrder(
    candidates,
    REVIEWER_EMAIL,
    TRY_OTHER_REVIEWERS,
  );
  const primaryLabel = process.env.FOLIO_REVIEWER_EMAIL
    ? '[FOLIO_REVIEWER_EMAIL]'
    : '[default reviewer@folio.local]';
  console.log(
    TRY_OTHER_REVIEWERS
      ? `→ try reviewers in order: ${reviewerOrder.map((c) => c.email).join(', ')}`
      : `→ reviewer ${reviewerOrder[0].email} ${primaryLabel}`,
  );

  console.log('\nGET /submissions?status=submitted');
  const subs = await api('/submissions?status=submitted');
  if (!Array.isArray(subs) || subs.length === 0) {
    throw new Error('No submitted submissions; run npm run seed in backend/.');
  }
  console.log(`→ ${subs.length} submission(s)`);

  const assignmentCache = new Map();
  async function loadAssignments(slug) {
    if (assignmentCache.has(slug)) {
      return assignmentCache.get(slug);
    }
    console.log(`\nGET /submissions/${slug}/assignments`);
    const assignments = await api(
      `/submissions/${encodeURIComponent(slug)}/assignments`,
    );
    assignmentCache.set(slug, assignments);
    return assignments;
  }

  let chosen = null;
  outer: for (const reviewer of reviewerOrder) {
    console.log(`\n── reviewer: ${reviewer.email} (${reviewer.id}) ──`);
    for (const s of subs) {
      const slug = s.slug;
      if (!slug) continue;
      let assignments = [];
      try {
        assignments = await loadAssignments(slug);
      } catch (e) {
        console.warn(`  skip ${slug}: cannot list assignments (${e.status})`);
        continue;
      }
      if (reviewerAlreadyActive(assignments, reviewer.id)) {
        console.log(
          `  skip ${slug}: ${reviewer.email} already invited or accepted`,
        );
        continue;
      }
      chosen = { slug, title: s.title, reviewer };
      console.log(
        `  → eligible for ${reviewer.email} (no invited/accepted row)`,
      );
      break outer;
    }
  }

  if (!chosen) {
    console.error(
      '\nNo submitted manuscript found without an active assignment for any tried reviewer.',
    );
    console.error(
      '(Every candidate is already invited or accepted on each submission in GET /submissions?status=submitted.)',
    );
    if (TRY_OTHER_REVIEWERS) {
      console.error(
        'Next: `cd backend && npm run seed:reset` (resets sample submissions), create another submitted manuscript,',
      );
      console.error(
        'add another user with reviewer + willingToReview, or clear/replace review_assignments rows (advanced).',
      );
    } else {
      console.error(
        'Try $env:FOLIO_REVIEWER_EMAIL="<another candidate>" or $env:FOLIO_TRY_OTHER_REVIEWERS="1",',
      );
      console.error(
        'or re-seed / add submissions / adjust review_assignments as above.',
      );
    }
    process.exit(2);
  }

  console.log(
    `\nPOST /submissions/${encodeURIComponent(chosen.slug)}/assignments`,
  );
  console.log(
    'slug:',
    chosen.slug,
    '|',
    chosen.title,
    '| reviewer:',
    chosen.reviewer.email,
  );

  const { status, body } = await tryAssign(chosen.slug, chosen.reviewer.id);
  console.log('HTTP', status, '(expected 201)');
  console.log(JSON.stringify(body, null, 2));
  if (status !== 201) {
    process.exit(1);
  }

  console.log(
    `\nWaiting ${WAIT_MS}ms (FOLIO_WAIT_MS; outbox drainer + email-service)…`,
  );
  await new Promise((r) => setTimeout(r, WAIT_MS));

  console.log('\nGET /admin/email/pipeline-status (after)\n');
  console.log(JSON.stringify(await api('/admin/email/pipeline-status'), null, 2));

  console.log('\nReminder — verify row growth in psql (same DB as backend):');
  console.log('  SELECT COUNT(*) FROM email.email_log;');
  console.log('  SELECT COUNT(*) FROM email.reminder;');
}

main().catch((e) => {
  if (e.body !== undefined) {
    console.error(JSON.stringify(e.body, null, 2));
  }
  console.error(e.message ?? e);
  process.exit(1);
});
