import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export type OAuthFlowMode = 'login' | 'link';

export type OAuthStatePayload = {
  mode: OAuthFlowMode;
  locale: 'en' | 'ar';
  next?: string;
  /** Present when mode=link — user id to attach ORCID to. */
  linkUserId?: string;
  nonce: string;
  exp: number;
};

function signPayload(encoded: string, secret: string): string {
  return createHmac('sha256', secret).update(encoded).digest('base64url');
}

export function encodeOAuthState(
  payload: Omit<OAuthStatePayload, 'nonce' | 'exp'>,
  secret: string,
  ttlMs = 10 * 60 * 1000,
): string {
  const full: OAuthStatePayload = {
    ...payload,
    nonce: randomBytes(16).toString('hex'),
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(full), 'utf8').toString(
    'base64url',
  );
  const sig = signPayload(encoded, secret);
  return `${encoded}.${sig}`;
}

export function decodeOAuthState(
  token: string,
  secret: string,
): OAuthStatePayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [encoded, sig] = parts;
  if (!encoded || !sig) {
    return null;
  }
  const expected = signPayload(encoded, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  let parsed: OAuthStatePayload;
  try {
    parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as OAuthStatePayload;
  } catch {
    return null;
  }
  if (
    typeof parsed.exp !== 'number' ||
    parsed.exp < Date.now() ||
    (parsed.mode !== 'login' && parsed.mode !== 'link') ||
    (parsed.locale !== 'en' && parsed.locale !== 'ar')
  ) {
    return null;
  }
  if (parsed.mode === 'link' && typeof parsed.linkUserId !== 'string') {
    return null;
  }
  return parsed;
}
