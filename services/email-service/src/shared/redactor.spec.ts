import { redactEventPayload } from './redactor';

describe('redactEventPayload', () => {
  it('redacts reviewer and invitedBy', () => {
    const out = redactEventPayload({
      type: 'ReviewerInvited',
      idempotencyKey: 'k',
      reviewer: { email: 'a@b.c' },
      invitedBy: { displayName: 'Ed' },
    });
    expect(out.reviewer).toBe('[redacted]');
    expect(out.invitedBy).toBe('[redacted]');
    expect(out.idempotencyKey).toBe('k');
  });

  it('handles non-object payload', () => {
    expect(redactEventPayload(null)).toMatchObject({
      value: '[non-object payload]',
    });
  });
});
