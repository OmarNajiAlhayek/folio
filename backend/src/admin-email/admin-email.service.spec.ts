import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AdminEmailService } from './admin-email.service';

describe('AdminEmailService', () => {
  let ds: jest.Mocked<Pick<DataSource, 'query'>>;
  let svc: AdminEmailService;

  beforeEach(() => {
    ds = { query: jest.fn() };
    svc = new AdminEmailService(ds as unknown as DataSource);
  });

  it('assertTemplateKey throws 422 for unknown key', () => {
    expect(() => svc.assertTemplateKey('not-a-key')).toThrow(
      UnprocessableEntityException,
    );
  });

  it('patchReminderPolicy throws Conflict when no row updated', async () => {
    ds.query.mockResolvedValueOnce([]);
    await expect(
      svc.patchReminderPolicy(21, new Date().toISOString()),
    ).rejects.toThrow(ConflictException);
  });

  it('patchTemplate throws UnprocessableEntity when Handlebars invalid', async () => {
    await expect(
      svc.patchTemplate(
        'reviewer-invited',
        '{{bad',
        'x',
        'y',
        new Date().toISOString(),
      ),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(ds.query).not.toHaveBeenCalled();
  });

  it('patchTemplate throws Conflict when optimistic lock fails', async () => {
    ds.query.mockResolvedValueOnce([]);
    await expect(
      svc.patchTemplate(
        'reviewer-invited',
        'ok {{submissionTitle}}',
        '<p>x</p>',
        'x',
        new Date().toISOString(),
      ),
    ).rejects.toThrow(ConflictException);
  });
});
