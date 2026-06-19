import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenGuard } from './service-token.guard';

function mockContext(
  headers: Record<string, string | string[] | undefined>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as ExecutionContext;
}

describe('ServiceTokenGuard', () => {
  const makeGuard = (token: string) =>
    new ServiceTokenGuard({
      get: (key: string) => (key === 'EMAIL_SERVICE_TOKEN' ? token : ''),
    } as ConfigService);

  it('throws when EMAIL_SERVICE_TOKEN is unset', () => {
    const guard = makeGuard('');
    expect(() => guard.canActivate(mockContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws when header is missing or wrong', () => {
    const guard = makeGuard('secret-token');
    expect(() => guard.canActivate(mockContext({}))).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      guard.canActivate(
        mockContext({ 'x-folio-service-token': 'wrong-token' }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('allows when header matches configured token', () => {
    const guard = makeGuard('secret-token');
    expect(
      guard.canActivate(
        mockContext({ 'x-folio-service-token': 'secret-token' }),
      ),
    ).toBe(true);
  });

  it('uses first value when header is an array', () => {
    const guard = makeGuard('secret-token');
    expect(
      guard.canActivate(
        mockContext({ 'x-folio-service-token': ['secret-token', 'other'] }),
      ),
    ).toBe(true);
  });
});
