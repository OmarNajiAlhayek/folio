import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AdminEmailService } from './admin-email.service';
import { TemplatesService } from '../templates/templates.service';

describe('AdminEmailService', () => {
  let ds: jest.Mocked<Pick<DataSource, 'query'>>;
  let templates: jest.Mocked<Pick<TemplatesService, 'render'>>;
  let svc: AdminEmailService;

  beforeEach(() => {
    ds = { query: jest.fn() };
    templates = { render: jest.fn() };
    svc = new AdminEmailService(
      ds as unknown as DataSource,
      templates as unknown as TemplatesService,
    );
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

  it('patchTemplate rejects unknown template variables', async () => {
    await expect(
      svc.patchTemplate(
        'submission-under-review',
        undefined,
        'ok {{submissionTitle}}',
        '<p>{{initiatedByRole}}</p>',
        'x',
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

  it('previewTemplate delegates render to TemplatesService', async () => {
    ds.query.mockResolvedValueOnce([
      { subject_template: 'x', html_body: 'y', text_body: 'z' },
    ]);
    templates.render.mockResolvedValueOnce({
      subject: 'Invite: Sample',
      html: '<p>ok</p>',
      text: 'ok',
    });

    const out = await svc.previewTemplate('reviewer-invited', undefined, 'en');

    expect(templates.render).toHaveBeenCalledWith(
      'reviewer-invited',
      'en',
      expect.objectContaining({
        reviewerDisplayName: 'Dr. Example Reviewer',
        submissionTitle: 'Sample manuscript title (preview)',
      }),
    );
    expect(out.html).toBe('<p>ok</p>');
  });
});
