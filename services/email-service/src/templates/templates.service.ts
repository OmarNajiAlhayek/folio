import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as Handlebars from 'handlebars';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { normalizeEmailLocale } from '../common/email-locale';
import { EmailTemplateEntity } from '../entities/email-template.entity';

const TEMPLATES_DIR = join(__dirname, '..', '..', 'templates');

const FILE_FALLBACK: Record<string, { subject: string }> = {
  'reviewer-invited': {
    subject: `Review invitation: {{#if submissionTitle}}{{submissionTitle}}{{else}}Folio manuscript{{/if}}`,
  },
  'reminder-due': {
    subject: `{{#if isOverdue}}Overdue review: {{#if submissionTitle}}{{submissionTitle}}{{else}}Folio manuscript{{/if}}{{else}}Reminder: review due for {{#if submissionTitle}}{{submissionTitle}}{{else}}Folio manuscript{{/if}}{{/if}}`,
  },
  'copyedit-assigned': {
    subject: 'Copyediting assignment: {{submissionTitle}}',
  },
  'copyedit-queries-sent': {
    subject: 'Copyedit requests (round {{round}}): {{submissionTitle}}',
  },
  'copyedit-author-ready': {
    subject: 'Author ready for copyedit review: {{submissionTitle}}',
  },
  'submission-submitted': {
    subject:
      '{{#if isResubmission}}Revised manuscript submitted{{else}}New submission received{{/if}}: {{submissionTitle}}',
  },
  'submission-decision': {
    subject: 'Editorial decision: {{submissionTitle}}',
  },
};

/** Must match `email.email_template` CHECK + transactional handlers. */
const ALLOWED = new Set([
  'reviewer-invited',
  'reminder-due',
  'copyedit-assigned',
  'copyedit-queries-sent',
  'copyedit-author-ready',
  'submission-submitted',
  'submission-decision',
]);

/**
 * Loads template bodies from `email.email_template` on every render
 * (no long-lived cache) so admin edits take effect on the next send.
 * Falls back to `en` row, then disk files if rows are missing.
 */
@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    @InjectRepository(EmailTemplateEntity)
    private readonly templateRepo: Repository<EmailTemplateEntity>,
  ) {}

  async render(
    name: string,
    localeInput: string,
    context: Record<string, unknown>,
  ): Promise<{ subject: string; html: string; text: string }> {
    if (!ALLOWED.has(name)) {
      throw new Error(`Unknown email template: ${name}`);
    }

    const locale = normalizeEmailLocale(localeInput);

    const row =
      (await this.templateRepo.findOne({
        where: { templateKey: name, locale },
      })) ??
      (locale !== 'en'
        ? await this.templateRepo.findOne({
            where: { templateKey: name, locale: 'en' },
          })
        : null);

    if (row) {
      return this.compileAndRun(row, context);
    }
    this.logger.warn(
      `template ${name} (${locale}) missing in DB; using file fallback (run migrations + seed)`,
    );
    return this.renderFromDisk(name, context);
  }

  private async compileAndRun(
    row: EmailTemplateEntity,
    context: Record<string, unknown>,
  ): Promise<{ subject: string; html: string; text: string }> {
    try {
      const subjectFn = Handlebars.compile(row.subjectTemplate);
      const htmlFn = Handlebars.compile(row.htmlBody);
      const textFn = Handlebars.compile(row.textBody);
      return {
        subject: subjectFn(context),
        html: htmlFn(context),
        text: textFn(context),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Template compile/render failed (${row.templateKey}/${row.locale}): ${msg}`,
      );
    }
  }

  private async renderFromDisk(
    name: string,
    context: Record<string, unknown>,
  ): Promise<{ subject: string; html: string; text: string }> {
    const meta = FILE_FALLBACK[name];
    if (!meta) {
      throw new Error(`Unknown email template: ${name}`);
    }
    const html = await fs.readFile(
      join(TEMPLATES_DIR, `${name}.html.hbs`),
      'utf8',
    );
    const text = await fs.readFile(
      join(TEMPLATES_DIR, `${name}.text.hbs`),
      'utf8',
    );
    const subjectFn = Handlebars.compile(meta.subject);
    const htmlFn = Handlebars.compile(html);
    const textFn = Handlebars.compile(text);
    return {
      subject: subjectFn(context),
      html: htmlFn(context),
      text: textFn(context),
    };
  }
}
