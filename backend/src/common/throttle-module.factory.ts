import type { ConfigService } from '@nestjs/config';
import type { ThrottleProfileName } from './throttle-profiles';

export function buildThrottlerModuleOptions(config: ConfigService) {
  const ttl = parseInt(config.get<string>('THROTTLE_TTL_MS', '60000'), 10);

  const profile = (name: ThrottleProfileName, envKey: string, defaultLimit: number) => ({
    name,
    ttl,
    limit: parseInt(config.get<string>(envKey, String(defaultLimit)), 10),
  });

  return [
    profile('default', 'THROTTLE_DEFAULT_LIMIT', 120),
    profile('public', 'THROTTLE_PUBLIC_LIMIT', 60),
    profile('upload', 'THROTTLE_UPLOAD_LIMIT', 20),
    profile('docx', 'THROTTLE_DOCX_LIMIT', 10),
    profile('sse', 'THROTTLE_SSE_LIMIT', 10),
    profile('login', 'THROTTLE_LOGIN_LIMIT', 10),
    profile('register', 'THROTTLE_REGISTER_LIMIT', 5),
  ];
}
