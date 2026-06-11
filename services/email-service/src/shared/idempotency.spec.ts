import {
  reviewerInvitedKey,
  reviewerRespondedKey,
  reminderDueKey,
  submissionUnderReviewKey,
} from '@folio/shared/messaging/idempotency';

describe('idempotency keys', () => {
  it('reviewerInvitedKey formats slug', () => {
    expect(reviewerInvitedKey('my-asg')).toBe('reviewer_invited:my-asg');
  });

  it('reviewerInvitedKey rejects empty slug', () => {
    expect(() => reviewerInvitedKey('')).toThrow(/required/);
  });

  it('reviewerRespondedKey formats slug and outcome', () => {
    expect(reviewerRespondedKey('asg-1', 'declined')).toBe(
      'reviewer_responded:asg-1:declined',
    );
  });

  it('reminderDueKey formats id', () => {
    expect(reminderDueKey('uuid-here')).toBe('reminder_due:uuid-here');
  });

  it('reminderDueKey rejects empty id', () => {
    expect(() => reminderDueKey('')).toThrow(/required/);
  });

  it('submissionUnderReviewKey formats slug and cycle', () => {
    expect(
      submissionUnderReviewKey('paper-one', '2026-06-01T12:00:00.000Z'),
    ).toBe('submission_under_review:paper-one:2026-06-01T12:00:00.000Z');
  });

  it('submissionUnderReviewKey accepts Date cycle', () => {
    const d = new Date('2026-06-01T12:00:00.000Z');
    expect(submissionUnderReviewKey('paper-one', d)).toBe(
      'submission_under_review:paper-one:2026-06-01T12:00:00.000Z',
    );
  });
});
