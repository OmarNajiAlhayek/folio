import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
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

  it('patchTemplate accepts RETURNING row with ISO string updatedAt (camelCase)', async () => {
    const iso = '2026-05-05T12:00:00.000Z';
    ds.query.mockResolvedValueOnce([
      {
        template_key: 'reviewer-invited',
        locale: 'ar',
        subject_template: 's',
        html_body: '<p>x</p>',
        text_body: 't',
        updatedAt: iso,
      },
    ]);
    const out = await svc.patchTemplate(
      'reviewer-invited',
      'ar',
      'ok {{submissionTitle}}',
      '<p>x</p>',
      't',
      iso,
    );
    expect(out.updatedAt).toBe(iso);
  });

  it('patchTemplate unwraps TypeORM Postgres UPDATE result tuple [rows, rowCount]', async () => {
    const iso = '2026-05-05T12:00:00.000Z';
    const row = {
      template_key: 'reviewer-invited',
      locale: 'ar',
      subject_template: 'ok {{submissionTitle}}',
      html_body: '<p>x</p>',
      text_body: 't',
      updated_at: new Date(iso),
    };
    ds.query.mockResolvedValueOnce([[row], 1]);
    const out = await svc.patchTemplate(
      'reviewer-invited',
      'ar',
      row.subject_template,
      row.html_body,
      row.text_body,
      iso,
    );
    expect(out.updatedAt).toBe(iso);
  });

  it('patchTemplate maps Postgres permission denied to ForbiddenException', async () => {
    ds.query.mockRejectedValueOnce(
      new QueryFailedError('', [], {
        code: '42501',
        message: 'permission denied for table email_template',
      }),
    );
    await expect(
      svc.patchTemplate(
        'reviewer-invited',
        undefined,
        'ok {{submissionTitle}}',
        '<p>x</p>',
        'x',
        new Date().toISOString(),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('patchReminderPolicy maps Postgres permission denied to ForbiddenException', async () => {
    ds.query.mockRejectedValueOnce(
      new QueryFailedError('', [], {
        code: '42501',
        message: 'permission denied for table email_reminder_policy',
      }),
    );
    await expect(
      svc.patchReminderPolicy(21, new Date().toISOString()),
    ).rejects.toThrow(ForbiddenException);
  });
});
