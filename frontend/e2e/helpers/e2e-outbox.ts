import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(join(process.cwd(), 'package.json'));
const { Client } = require(
  join(process.cwd(), '../backend/node_modules/pg'),
) as {
  Client: new (config: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  }) => {
    connect(): Promise<void>;
    end(): Promise<void>;
    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  };
};

function loadBackendEnvFile(): Record<string, string> {
  const envPath = join(process.cwd(), '../backend/.env');
  if (!existsSync(envPath)) {
    return {};
  }
  const env: Record<string, string> = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq < 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const backendEnv = loadBackendEnvFile();

function pgConfig() {
  return {
    host:
      process.env.E2E_DB_HOST ??
      process.env.DB_HOST ??
      backendEnv.DB_HOST ??
      'localhost',
    port: Number(
      process.env.E2E_DB_PORT ??
        process.env.DB_PORT ??
        backendEnv.DB_PORT ??
        5432,
    ),
    user:
      process.env.E2E_DB_USERNAME ??
      process.env.DB_USERNAME ??
      backendEnv.DB_USERNAME ??
      'postgres',
    password:
      process.env.E2E_DB_PASSWORD ??
      process.env.DB_PASSWORD ??
      backendEnv.DB_PASSWORD ??
      'changeme',
    database:
      process.env.E2E_DB_DATABASE ??
      process.env.DB_DATABASE ??
      backendEnv.DB_DATABASE ??
      'folio_review',
  };
}

/** Latest 6-digit OTP from the transactional outbox for auth email verification. */
export async function latestVerificationOtp(email: string): Promise<string> {
  const client = new Client(pgConfig());
  await client.connect();
  try {
    const res = await client.query<{ otp: string | null }>(
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
      throw new Error(`No verification OTP in outbox for ${email}`);
    }
    return otp;
  } finally {
    await client.end();
  }
}
