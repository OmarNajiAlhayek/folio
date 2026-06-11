import { createHash, randomBytes } from 'crypto';

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashIp(ip: string | undefined, secret: string): string | null {
  if (!ip?.trim()) return null;
  return createHash('sha256').update(`${secret}:${ip.trim()}`).digest('hex');
}
