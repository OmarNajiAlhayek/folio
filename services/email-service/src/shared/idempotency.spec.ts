import { reviewerInvitedKey, reminderDueKey } from './idempotency';

describe('idempotency keys', () => {
  it('reviewerInvitedKey formats slug', () => {
    expect(reviewerInvitedKey('my-asg')).toBe('reviewer_invited:my-asg');
  });

  it('reviewerInvitedKey rejects empty slug', () => {
    expect(() => reviewerInvitedKey('')).toThrow(/required/);
  });

  it('reminderDueKey formats id', () => {
    expect(reminderDueKey('uuid-here')).toBe('reminder_due:uuid-here');
  });

  it('reminderDueKey rejects empty id', () => {
    expect(() => reminderDueKey('')).toThrow(/required/);
  });
});
