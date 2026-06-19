/**
 * Prepare perf fixtures: login accounts and write perf/.env.json for k6.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const BASE = (
  process.env.FOLIO_API_BASE ?? 'http://localhost:5243/api/v1'
).replace(/\/+$/, '');
const FIXTURES_PATH =
  process.env.PERF_FIXTURES ?? join(__dirname, 'fixtures.json');
const OUTPUT_PATH = process.env.PERF_OUTPUT ?? join(__dirname, '.env.json');

async function api(path, { method = 'GET', json, bearer } = {}) {
  const headers = { Accept: 'application/json' };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function fail(msg) {
  console.error(`perf setup: ${msg}`);
  process.exit(1);
}

if (!existsSync(FIXTURES_PATH)) {
  fail(
    `missing ${FIXTURES_PATH} — run: cd backend && npm run seed:perf`,
  );
}

const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));

const health = await api('/health');
if (health.status !== 200) {
  fail(`GET /health returned ${health.status} — is the backend running?`);
}

async function loginAccount({ email, password }, label) {
  const res = await api('/auth/login', {
    method: 'POST',
    json: { email, password },
  });
  if (res.status !== 200 && res.status !== 201) {
    fail(`${label} login failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  const token = res.body?.accessToken;
  if (!token) {
    fail(
      `${label} login missing accessToken — set AUTH_RETURN_BEARER=true on backend`,
    );
  }
  return token;
}

console.log(`perf setup → ${BASE}`);

const editorToken = await loginAccount(fixtures.editor, 'editor');
const managerToken = fixtures.manager
  ? await loginAccount(fixtures.manager, 'manager')
  : editorToken;
const authorToken = fixtures.author
  ? await loginAccount(fixtures.author, 'author')
  : null;

const reviewers = [];
for (const entry of fixtures.reviewSubmit ?? []) {
  const token = await loginAccount(
    { email: entry.reviewerEmail, password: entry.password },
    entry.reviewerEmail,
  );
  reviewers.push({
    token,
    assignmentSlug: entry.assignmentSlug,
    reviewerEmail: entry.reviewerEmail,
  });
}

const authAccounts = [
  fixtures.editor,
  fixtures.manager,
  fixtures.author,
  ...(fixtures.reviewSubmit ?? []).map((r) => ({
    email: r.reviewerEmail,
    password: r.password,
  })),
].filter(Boolean);

const output = {
  baseUrl: BASE,
  editorToken,
  managerToken,
  authorToken,
  reviewers,
  authAccounts,
  emailPipeline: {
    invites: fixtures.emailPipeline?.invites ?? [],
  },
  corpusSimilarity: fixtures.corpusSimilarity ?? null,
  aiGrpcHost: fixtures.aiGrpcHost ?? 'localhost:5246',
  editorQueueSlugs: fixtures.editorQueue?.slugs ?? [],
  uploadDraftSlug: fixtures.uploadDraft?.slug ?? null,
  searchTerms: fixtures.searchTerms ?? [
    'education',
    'machine',
    'research',
    'journal',
    'peer',
  ],
  thresholdsPath: join(__dirname, 'thresholds.json'),
};

mkdirSync(join(__dirname, 'reports'), { recursive: true });
writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
console.log(`Wrote ${OUTPUT_PATH}`);
console.log(`  reviewers ready: ${reviewers.length}`);
console.log(`  email invites: ${output.emailPipeline.invites.length}`);
console.log(`  editor queue slugs: ${output.editorQueueSlugs.length}`);

if (!process.env.THROTTLE_UPLOAD_LIMIT) {
  console.warn(
    'perf setup: set THROTTLE_UPLOAD_LIMIT=10000 on the backend for file-upload benchmarks (default is 20/min)',
  );
}
