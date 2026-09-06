/**
 * Refuses to seed anything that does not look like a local development machine.
 *
 * `seed.ts` bootstraps through `NestFactory.createApplicationContext`, so it
 * never runs `main.ts` and none of `validateBackendRuntimeConfig` applies to it.
 * Without this guard, `npm run seed` creates editor and journal-manager accounts
 * with published passwords against whatever `DB_HOST` points at, and
 * `SEED_RESET_ALL=1` truncates every table and deletes the uploads directory.
 *
 * The environment signals mirror `isLocalDevSandbox` in
 * `common/validate-runtime-config.ts` — kept in sync deliberately, but read from
 * `process.env` so the check can run before any DI container or DB connection.
 */

export class SeedNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedNotAllowedError';
  }
}

const LOCAL_DEV_NODE_ENVS = new Set(['development', 'test']);

const LOCAL_DB_HOSTS = new Set([
  '',
  'localhost',
  '127.0.0.1',
  'host.docker.internal',
  // Compose service name — only reachable from inside the dev network.
  'postgres',
]);

/** Env vars whose presence means the run will destroy existing data. */
export const DESTRUCTIVE_SEED_FLAGS = [
  'SEED_RESET_ALL',
  'SEED_RESET_SAMPLE',
  'SEED_RESET_DEMO',
] as const;

export const DESTRUCTIVE_SEED_OVERRIDE = 'FOLIO_ALLOW_DESTRUCTIVE_SEED';

export type SeedEnv = Record<string, string | undefined>;

function isLocalhostishUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return true;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

/** Which destructive flags are switched on in this environment. */
export function activeDestructiveFlags(env: SeedEnv): string[] {
  return DESTRUCTIVE_SEED_FLAGS.filter((key) => env[key] === '1');
}

/**
 * Throws {@link SeedNotAllowedError} unless this is a local dev environment.
 * Destructive runs additionally require an explicit opt-in. The
 * `seed:fresh` / `seed:reset` npm scripts set that flag; a bare
 * `SEED_RESET_ALL=1` in the environment is not enough. Production
 * hosts are still refused by NODE_ENV / DB_HOST / AUTH_COOKIE_SECURE.
 */
export function assertSeedAllowed(env: SeedEnv = process.env): void {
  const nodeEnv = (env.NODE_ENV ?? 'development').trim().toLowerCase();
  const refuse = (why: string): never => {
    throw new SeedNotAllowedError(
      `Refusing to seed: ${why}. The seed script creates accounts with ` +
        'published passwords and can truncate every table — it is for local ' +
        'development only. If this really is a dev machine, correct the ' +
        'environment rather than bypassing this check.',
    );
  };

  if (!LOCAL_DEV_NODE_ENVS.has(nodeEnv)) {
    refuse(`NODE_ENV is "${nodeEnv}", not development or test`);
  }
  if (env.RUNTIME_CONFIG_STRICT === 'true') {
    refuse('RUNTIME_CONFIG_STRICT=true marks this environment as deployed');
  }
  if (env.AUTH_COOKIE_SECURE === 'true') {
    refuse('AUTH_COOKIE_SECURE=true indicates a deployed HTTPS environment');
  }

  const appBase = (env.APP_BASE_URL ?? '').trim();
  if (appBase !== '' && !isLocalhostishUrl(appBase)) {
    refuse(`APP_BASE_URL "${appBase}" is not localhost`);
  }

  const dbHost = (env.DB_HOST ?? 'localhost').trim().toLowerCase();
  if (!LOCAL_DB_HOSTS.has(dbHost)) {
    refuse(`DB_HOST "${dbHost}" is not a local database`);
  }

  const destructive = activeDestructiveFlags(env);
  if (destructive.length > 0 && env[DESTRUCTIVE_SEED_OVERRIDE] !== '1') {
    throw new SeedNotAllowedError(
      `${destructive.join(', ')} will permanently delete existing data ` +
        `(SEED_RESET_ALL truncates every table and clears uploads/). ` +
        `Set ${DESTRUCTIVE_SEED_OVERRIDE}=1 in the same command to confirm:\n` +
        `  ${DESTRUCTIVE_SEED_OVERRIDE}=1 npm run seed:fresh`,
    );
  }
}

/** One-line summary of the target, printed before a destructive run. */
export function describeSeedTarget(env: SeedEnv = process.env): string {
  const host = (env.DB_HOST ?? 'localhost').trim() || 'localhost';
  const port = (env.DB_PORT ?? '5432').trim() || '5432';
  const database = (env.DB_DATABASE ?? 'folio_review').trim() || 'folio_review';
  return `${host}:${port}/${database}`;
}
