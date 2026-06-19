import {
  isTransientDbError,
  isTransientDeliveryError,
  providerSendOutcome,
} from '../common/transient-error.util';

describe('transient-error.util', () => {
  describe('isTransientDbError', () => {
    it('detects connection errno codes', () => {
      expect(isTransientDbError({ code: 'ETIMEDOUT', message: 'x' })).toBe(
        true,
      );
    });

    it('detects pool exhaustion messages', () => {
      expect(
        isTransientDbError(new Error('sorry, too many clients already')),
      ).toBe(true);
    });

    it('rejects unrelated errors', () => {
      expect(isTransientDbError(new Error('syntax error'))).toBe(false);
    });
  });

  describe('isTransientDeliveryError', () => {
    it('treats smtp timeout as transient', () => {
      expect(isTransientDeliveryError(new Error('smtp timeout'))).toBe(true);
    });

    it('treats 550 as permanent', () => {
      expect(
        isTransientDeliveryError(new Error('550 mailbox unavailable')),
      ).toBe(false);
    });

    it('treats missing SMTP config as permanent', () => {
      expect(
        isTransientDeliveryError(
          new Error('SMTP not configured (SMTP_HOST missing)'),
        ),
      ).toBe(false);
    });
  });

  describe('providerSendOutcome', () => {
    it('returns nack-requeue for transient errors', () => {
      expect(providerSendOutcome(new Error('ETIMEDOUT'))).toBe('nack-requeue');
    });

    it('returns nack-no-requeue for permanent errors', () => {
      expect(providerSendOutcome(new Error('550 rejected'))).toBe(
        'nack-no-requeue',
      );
    });
  });
});
