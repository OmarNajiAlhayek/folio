import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';

function mockContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('allows GET without CSRF', () => {
    expect(
      guard.canActivate(
        mockContext({ method: 'GET', path: '/api/v1/submissions', headers: {} }),
      ),
    ).toBe(true);
  });

  it('allows Bearer without CSRF', () => {
    expect(
      guard.canActivate(
        mockContext({
          method: 'POST',
          path: '/api/v1/submissions',
          headers: { authorization: 'Bearer token' },
        }),
      ),
    ).toBe(true);
  });

  it('rejects POST without matching CSRF', () => {
    expect(() =>
      guard.canActivate(
        mockContext({
          method: 'POST',
          path: '/api/v1/submissions',
          headers: {},
          cookies: { folio_csrf: 'a' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows POST when CSRF header matches cookie', () => {
    expect(
      guard.canActivate(
        mockContext({
          method: 'POST',
          path: '/api/v1/submissions',
          headers: { 'x-csrf-token': 'tok' },
          cookies: { folio_csrf: 'tok', folio_access: 'jwt' },
        }),
      ),
    ).toBe(true);
  });

  it('allows standalone docx POST with session cookie only', () => {
    expect(
      guard.canActivate(
        mockContext({
          method: 'POST',
          path: '/api/v1/submissions/generate-docx-standalone',
          headers: {},
          cookies: { folio_access: 'jwt' },
        }),
      ),
    ).toBe(true);
  });
});
