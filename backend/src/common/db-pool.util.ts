import type { ConfigService } from '@nestjs/config';

/** Shared pg-pool / statement_timeout options for TypeORM `extra`. */
export function buildTypeOrmExtra(
  config: ConfigService,
): Record<string, unknown> {
  const extra: Record<string, unknown> = {
    max: parseInt(config.get<string>('DB_POOL_MAX', '30'), 10),
  };

  const idleTimeout = config.get<string>('DB_POOL_IDLE_TIMEOUT_MS');
  if (idleTimeout) {
    extra.idleTimeoutMillis = parseInt(idleTimeout, 10);
  }

  const connectionTimeout = config.get<string>('DB_POOL_CONNECTION_TIMEOUT_MS');
  if (connectionTimeout) {
    extra.connectionTimeoutMillis = parseInt(connectionTimeout, 10);
  }

  const statementTimeoutMs = config.get<string>('DB_STATEMENT_TIMEOUT_MS');
  if (statementTimeoutMs) {
    extra.options = `-c statement_timeout=${parseInt(statementTimeoutMs, 10)}`;
  }

  return extra;
}

export function typeOrmSlowQueryOptions(config: ConfigService): {
  maxQueryExecutionTime?: number;
  logging?: ('warn' | 'error')[];
} {
  const raw = config.get<string>('TYPEORM_MAX_QUERY_EXECUTION_TIME_MS');
  if (!raw) return {};
  const ms = parseInt(raw, 10);
  if (!Number.isFinite(ms) || ms <= 0) return {};
  return { maxQueryExecutionTime: ms, logging: ['warn'] };
}
