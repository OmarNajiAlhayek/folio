/**
 * Auth smoke test for local dev or staging.
 *
 * Exercises: health → register (or login) → OTP verify → /me → refresh → logout.
 * OTP is read from `outbound_event_outbox` (same Postgres as the API).
 *
 * Usage (from repo root or backend/):
 *   node backend/scripts/smoke-auth.mjs
 *
 * Optional env:
 *   FOLIO_API_BASE          default http://localhost:5243/api/v1
 *   FOLIO_SMOKE_EMAIL       use existing account (skips register)
 *   FOLIO_SMOKE_PASSWORD    required with FOLIO_SMOKE_EMAIL
 *   DB_HOST, DB_PORT, ...   default loaded from backend/.env when present
 *
 * Staging without DB access: set FOLIO_SMOKE_OTP to skip the outbox query.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, '../package.json'));
const { Client } = require('pg');

const BASE = (process.env.FOLIO_API_BASE ?? 'http://localhost:5243/api/v1').replace(
  /\/+$/,
  '',
);

function loadBackendEnv() {
  const envPath = join(__dirname, '../.env');
  const env = { ...process.env };
  if (!existsSync(envPath)) {
    return env;
  }
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (env[key] == null || env[key] === '') {
      env[key] = value;
    }
  }
  return env;
}

const env = loadBackendEnv();

function pgConfig() {
  return {
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 5432),
    user: env.DB_USERNAME ?? 'postgres',
    password: env.DB_PASSWORD ?? 'changeme',
    database: env.DB_DATABASE ?? 'folio_review',
  };
}

class CookieJar {
  /** @type {Record<string, string>} */
  #cookies = {};

  ingest(response) {
    const list =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [];
    for (const header of list) {
      const pair = header.split(';')[0];
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      this.#cookies[name] = value;
    }
  }

  header() {
    return Object.entries(this.#cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  get(name) {
    return this.#cookies[name];
  }
}

const jar = new CookieJar();

async function api(path, { method = 'GET', json, bearer } = {}) {
  const headers = { Accept: 'application/json' };
  const cookie = jar.header();
  if (cookie) headers.Cookie = cookie;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
  }
  const csrf = jar.get('folio_csrf');
  if (csrf && method !== 'GET' && method !== 'HEAD') {
    headers['X-CSRF-Token'] = csrf;
  }

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  jar.ingest(response);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body, status: response.status };
}

async function latestVerificationOtp(email) {
  if (process.env.FOLIO_SMOKE_OTP) {
    return process.env.FOLIO_SMOKE_OTP.trim();
  }
  const client = new Client(pgConfig());
  await client.connect();
  try {
    const res = await client.query(
      `SELECT payload->>'otpCode' AS otp
       FROM outbound_event_outbox
       WHERE routing_key = 'auth.verification_otp'
         AND payload->'user'->>'email' = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [email],
    );
    const otp = res.rows[0]?.otp;
    if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
      throw new Error(`No OTP in outbox for ${email}`);
    }
    return otp;
  } finally {
    await client.end();
  }
}

function fail(step, detail) {
  console.error(`FAIL  ${step}`);
  console.error(`      ${detail}`);
  process.exit(1);
}

function ok(step) {
  console.log(`ok    ${step}`);
}

const smokeEmail =
  process.env.FOLIO_SMOKE_EMAIL ??
  `smoke-auth-${Date.now()}@folio.local`;
const smokePassword = process.env.FOLIO_SMOKE_PASSWORD ?? 'SmokePass123!';

console.log(`Auth smoke → ${BASE}`);
console.log(`Account  → ${smokeEmail}`);
console.log('');

let health;
try {
  health = await api('/health');
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
    fail(
      'GET /health',
      `cannot reach ${BASE} — start the backend (npm run start:dev in backend/)`,
    );
  }
  throw err;
}
if (health.status !== 200) {
  fail('GET /health', `status ${health.status}`);
}
ok('GET /health');

if (process.env.FOLIO_SMOKE_EMAIL) {
  const login = await api('/auth/login', {
    method: 'POST',
    json: { email: smokeEmail, password: smokePassword },
  });
  if (login.status !== 201 && login.status !== 200) {
    fail('POST /auth/login', JSON.stringify(login.body));
  }
  ok('POST /auth/login (existing account)');
} else {
  const register = await api('/auth/register', {
    method: 'POST',
    json: {
      email: smokeEmail,
      password: smokePassword,
      displayName: 'Auth Smoke',
      willingToReview: false,
    },
  });
  if (register.status !== 201) {
    fail('POST /auth/register', JSON.stringify(register.body));
  }
  ok('POST /auth/register');
}

let me = await api('/auth/me');
if (me.status !== 200) {
  fail('GET /auth/me (after sign-in)', JSON.stringify(me.body));
}

if (!me.body?.emailVerified) {
  const otp = await latestVerificationOtp(smokeEmail);
  const verify = await api('/auth/verify-email', {
    method: 'POST',
    json: { code: otp },
  });
  if (verify.status !== 201 && verify.status !== 200) {
    fail('POST /auth/verify-email', JSON.stringify(verify.body));
  }
  ok('POST /auth/verify-email (OTP from outbox)');

  me = await api('/auth/me');
  if (!me.body?.emailVerified) {
    fail('GET /auth/me', 'emailVerified still false after OTP');
  }
} else {
  ok('GET /auth/me (already verified)');
}

ok('GET /auth/me (emailVerified=true)');

const refresh = await api('/auth/refresh', { method: 'POST' });
if (refresh.status !== 201 && refresh.status !== 200) {
  fail('POST /auth/refresh', JSON.stringify(refresh.body));
}
ok('POST /auth/refresh (cookie rotation)');

const meAfterRefresh = await api('/auth/me');
if (meAfterRefresh.status !== 200) {
  fail('GET /auth/me (after refresh)', JSON.stringify(meAfterRefresh.body));
}
ok('GET /auth/me (after refresh)');

const logout = await api('/auth/logout', {
  method: 'POST',
  json: {},
});
if (logout.status !== 201 && logout.status !== 200) {
  fail('POST /auth/logout', JSON.stringify(logout.body));
}
ok('POST /auth/logout');

const meAfterLogout = await api('/auth/me');
if (meAfterLogout.status !== 401) {
  fail('GET /auth/me (after logout)', `expected 401, got ${meAfterLogout.status}`);
}
ok('GET /auth/me (session ended → 401)');

console.log('');
console.log('Auth smoke passed.');
