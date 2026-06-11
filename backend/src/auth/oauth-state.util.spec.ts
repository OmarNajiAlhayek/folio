import { decodeOAuthState, encodeOAuthState } from './oauth-state.util';

const SECRET = 'test-secret-for-oauth-state-signing-32chars';

describe('oauth-state.util', () => {
  it('round-trips login state', () => {
    const token = encodeOAuthState(
      { mode: 'login', locale: 'en', next: '/dashboard' },
      SECRET,
    );
    const decoded = decodeOAuthState(token, SECRET);
    expect(decoded).toMatchObject({
      mode: 'login',
      locale: 'en',
      next: '/dashboard',
    });
  });

  it('round-trips link state with user id', () => {
    const token = encodeOAuthState(
      { mode: 'link', locale: 'ar', linkUserId: 'user-123' },
      SECRET,
    );
    const decoded = decodeOAuthState(token, SECRET);
    expect(decoded).toMatchObject({
      mode: 'link',
      locale: 'ar',
      linkUserId: 'user-123',
    });
  });

  it('rejects tampered signature', () => {
    const token = encodeOAuthState({ mode: 'login', locale: 'en' }, SECRET);
    const [encoded] = token.split('.');
    const bad = `${encoded}.bad-signature`;
    expect(decodeOAuthState(bad, SECRET)).toBeNull();
  });
});
