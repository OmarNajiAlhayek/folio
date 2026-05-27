import { Repository } from 'typeorm';
import { EmailTemplateEntity } from '../entities/email-template.entity';
import { TemplatesService } from './templates.service';

describe('TemplatesService', () => {
  const makeRow = (
    key: string,
    partial: Partial<EmailTemplateEntity> = {},
  ): EmailTemplateEntity =>
    ({
      templateKey: key,
      locale: 'en',
      subjectTemplate: `Sub {{submissionTitle}}`,
      htmlBody: '<p>{{reviewerDisplayName}}</p>',
      textBody: '{{reviewerDisplayName}}',
      updatedAt: new Date(),
      ...partial,
    }) as EmailTemplateEntity;

  it('renders from DB row when present', async () => {
    const findOne = jest
      .fn()
      .mockResolvedValue(
        makeRow('reviewer-invited', {
          subjectTemplate: 'Invite: {{submissionTitle}}',
          htmlBody: '<b>{{reviewerDisplayName}}</b>',
          textBody: 'Hi {{reviewerDisplayName}}',
        }),
      );
    const repo = { findOne } as unknown as Repository<EmailTemplateEntity>;
    const svc = new TemplatesService(repo);

    const r = await svc.render('reviewer-invited', 'en', {
      reviewerDisplayName: 'Jane',
      submissionTitle: 'Quantum Frogs',
      acceptUrl: 'http://localhost/a',
      declineUrl: 'http://localhost/d',
    });
    expect(r.subject).toContain('Quantum Frogs');
    expect(r.html).toContain('Jane');
    expect(r.text).toContain('Jane');
  });

  it('falls back to disk when row missing', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const repo = { findOne } as unknown as Repository<EmailTemplateEntity>;
    const svc = new TemplatesService(repo);

    const r = await svc.render('reminder-due', 'en', {
      reviewerDisplayName: 'Jane',
      submissionTitle: '[manuscript]',
      assignmentUrl: 'http://localhost/asg',
      dueAt: '2026-06-01',
      isOverdue: false,
    });
    expect(r.subject).toContain('[manuscript]');
    expect(r.html).toContain('data-folio-email="1"');
  });

  it('falls back to disk for copyedit-assigned when row missing', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const repo = { findOne } as unknown as Repository<EmailTemplateEntity>;
    const svc = new TemplatesService(repo);

    const r = await svc.render('copyedit-assigned', 'en', {
      copyeditorDisplayName: 'Pat',
      submissionTitle: 'Quantum Frogs',
      workbenchUrl: 'http://localhost/copyedit/asg',
      assignedByDisplayName: 'Ed',
    });
    expect(r.subject).toContain('Quantum Frogs');
    expect(r.html).toContain('Pat');
  });

  it('throws for unknown template', async () => {
    const repo = {
      findOne: jest.fn(),
    } as unknown as Repository<EmailTemplateEntity>;
    const svc = new TemplatesService(repo);
    await expect(svc.render('nope', 'en', {})).rejects.toThrow(
      /Unknown email template/,
    );
  });
});
