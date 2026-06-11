import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
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
        undefined,
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
        undefined,
        'ok {{submissionTitle}}',
        '<p>x</p>',
        'x',
        new Date().toISOString(),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('patchTemplate uses millisecond date_trunc for optimistic lock', async () => {
    const iso = '2026-05-05T08:42:43.581Z';
    ds.query.mockResolvedValueOnce([
      {
        template_key: 'reviewer-invited',
        locale: 'ar',
        subject_template: 'ok {{submissionTitle}}',
        html_body: '<p>x</p>',
        text_body: 't',
        updated_at: new Date('2026-05-05T08:42:43.581456Z'),
      },
    ]);
    await svc.patchTemplate(
      'reviewer-invited',
      'ar',
      'ok {{submissionTitle}}',
      '<p>x</p>',
      't',
      iso,
    );
    const [sql] = ds.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('date_trunc(\'milliseconds\', "updated_at")');
    expect(sql).toContain("date_trunc('milliseconds', $6::timestamptz)");
  });
});
