import { redactEventPayload } from '@folio/shared/messaging/redactor';

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

  it('redacts messageForAuthor', () => {
    const out = redactEventPayload({
      type: 'SubmissionDecision',
      idempotencyKey: 'k',
      messageForAuthor: 'Confidential editorial note',
    });
    expect(out.messageForAuthor).toBe('[redacted]');
  });

  it('handles non-object payload', () => {
    expect(redactEventPayload(null)).toMatchObject({
      value: '[non-object payload]',
    });
  });
});
