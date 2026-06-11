import { Client } from 'typesense';
import { ConfigService } from '@nestjs/config';

export const TYPESENSE_CLIENT = 'TYPESENSE_CLIENT';

export function createTypesenseClient(config: ConfigService): Client | null {
  const enabled =
    config.get<string>('TYPESENSE_ENABLED', 'false').toLowerCase() === 'true';
  if (!enabled) return null;
  return new Client({
    nodes: [
      {
        host: config.get<string>('TYPESENSE_HOST', 'localhost'),
        port: parseInt(config.get<string>('TYPESENSE_PORT', '8108'), 10),
        protocol: 'http',
      },
    ],
    apiKey: config.get<string>('TYPESENSE_API_KEY', ''),
    connectionTimeoutSeconds: 5,
    retryIntervalSeconds: 0.1,
    numRetries: 2,
  });
}
