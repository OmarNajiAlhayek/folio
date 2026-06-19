/**
 * Load DB_* (and related) vars from backend/.env when not already set in process.env.
 * Dev compose uses port 5434; CI/local compose sets DB_PORT explicitly.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ENV_PATH = join(__dirname, '..', '..', 'backend', '.env');

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function loadBackendEnv(keys = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE']) {
  const loaded = {};
  if (!existsSync(BACKEND_ENV_PATH)) {
    return loaded;
  }

  const wanted = new Set(keys);
  for (const line of readFileSync(BACKEND_ENV_PATH, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!wanted.has(key) || process.env[key] !== undefined) continue;
    loaded[key] = unquote(trimmed.slice(eq + 1));
  }
  return loaded;
}

export function resolveDbConfig() {
  const fromFile = loadBackendEnv();
  return {
    host: process.env.DB_HOST ?? fromFile.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? fromFile.DB_PORT ?? '5434', 10),
    user: process.env.DB_USERNAME ?? fromFile.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? fromFile.DB_PASSWORD ?? 'changeme',
    database: process.env.DB_DATABASE ?? fromFile.DB_DATABASE ?? 'folio_review',
  };
}
