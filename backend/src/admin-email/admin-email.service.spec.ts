import { EmailServiceClient } from '../email-client/email-client.service';
import { AdminEmailService } from './admin-email.service';

describe('AdminEmailService', () => {
  let client: jest.Mocked<
    Pick<
      EmailServiceClient,
      | 'getReminderPolicy'
      | 'patchReminderPolicy'
      | 'getTemplate'
      | 'patchTemplate'
      | 'previewTemplate'
    >
  >;
  let svc: AdminEmailService;

  beforeEach(() => {
    client = {
      getReminderPolicy: jest.fn(),
      patchReminderPolicy: jest.fn(),
      getTemplate: jest.fn(),
      patchTemplate: jest.fn(),
      previewTemplate: jest.fn(),
    };
    svc = new AdminEmailService(client as unknown as EmailServiceClient);
  });

  it('getReminderPolicy delegates to email client', async () => {
    const policy = {
      id: 1,
      reviewDueInDays: 21,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    client.getReminderPolicy.mockResolvedValue(policy);
    await expect(svc.getReminderPolicy()).resolves.toEqual(policy);
  });

  it('patchTemplate delegates to email client', async () => {
    const tpl = {
      templateKey: 'reviewer-invited',
      locale: 'en',
      subjectTemplate: 's',
      htmlBody: '<p>x</p>',
      textBody: 't',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    client.patchTemplate.mockResolvedValue(tpl);
    await expect(
      svc.patchTemplate(
        'reviewer-invited',
        'en',
        's',
        '<p>x</p>',
        't',
        tpl.updatedAt,
      ),
    ).resolves.toEqual(tpl);
  });
});
