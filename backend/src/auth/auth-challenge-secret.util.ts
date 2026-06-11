import { randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { hashRefreshToken } from './refresh-token.util';

export function hashAuthSecret(secret: string): string {
  return hashRefreshToken(secret);
}

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function generateResetToken(): string {
  return randomBytes(32).toString('base64url');
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
