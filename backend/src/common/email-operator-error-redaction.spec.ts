import { redactOperatorErrorMessage } from './email-operator-error-redaction';

describe('redactOperatorErrorMessage', () => {
  it('replaces hostnames', () => {
    expect(
      redactOperatorErrorMessage(
        'SMTP smtp.mail.example.com refused connection',
      ),
    ).toBe('SMTP [host] refused connection');
  });

  it('replaces unix paths', () => {
    expect(
      redactOperatorErrorMessage('ENOENT: /var/app/config/mail.json missing'),
    ).toBe('ENOENT: [path] missing');
  });

  it('replaces stack lines with [frame]', () => {
    expect(
      redactOperatorErrorMessage('Boom\n    at sendMail (node:internal/fs)'),
    ).toBe('Boom [frame]');
  });
});
