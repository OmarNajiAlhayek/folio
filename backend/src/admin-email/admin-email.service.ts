import * as Handlebars from 'handlebars';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  type AdminEmailTemplateKey,
  isAdminEmailTemplateKey,
} from './admin-email.constants';

export type ReminderPolicyView = {
  id: number;
  reviewDueInDays: number;
  updatedAt: string;
};

export type EmailTemplateView = {
  templateKey: string;
  subjectTemplate: string;
  htmlBody: string;
  textBody: string;
  updatedAt: string;
};

export type RenderedTemplateView = {
  subject: string;
  html: string;
  text: string;
};

const PREVIEW_CONTEXT: Record<
  AdminEmailTemplateKey,
  Record<string, unknown>
> = {
  'reviewer-invited': {
    reviewerDisplayName: 'Dr. Example Reviewer',
    submissionTitle: 'Sample manuscript title (preview)',
    acceptUrl: 'https://example.org/preview/accept',
    declineUrl: 'https://example.org/preview/decline',
  },
  'reminder-due': {
    reviewerDisplayName: 'Dr. Example Reviewer',
    submissionTitle: 'Sample manuscript title (preview)',
    assignmentUrl: 'https://example.org/preview/assignments/asg-preview',
    dueAt: '2026-12-15T00:00:00.000Z',
    isOverdue: false,
  },
};

@Injectable()
export class AdminEmailService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  assertTemplateKey(key: string): asserts key is AdminEmailTemplateKey {
    if (!isAdminEmailTemplateKey(key)) {
      throw new UnprocessableEntityException({
        message: 'Invalid email template key',
        code: 'INVALID_TEMPLATE_KEY',
      });
    }
  }

  private validateHandlebars(
    key: AdminEmailTemplateKey,
    subjectTemplate: string,
    htmlBody: string,
    textBody: string,
  ): void {
    const ctx = { ...PREVIEW_CONTEXT[key] };
    try {
      Handlebars.compile(subjectTemplate)(ctx);
      Handlebars.compile(htmlBody)(ctx);
      Handlebars.compile(textBody)(ctx);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new UnprocessableEntityException({
        message: `Template failed to compile: ${msg}`,
        code: 'TEMPLATE_COMPILE_ERROR',
      });
    }
  }

  async getReminderPolicy(): Promise<ReminderPolicyView> {
    const rows = (await this.dataSource.query(
      `SELECT id, review_due_in_days, updated_at
         FROM "email"."email_reminder_policy"
        WHERE id = 1
        LIMIT 1`,
    )) as Array<{
      id: number;
      review_due_in_days: number;
      updated_at: Date;
    }>;
    if (rows.length === 0) {
      throw new NotFoundException({
        message: 'Reminder policy not found; run email-service migrations',
        code: 'EMAIL_POLICY_NOT_FOUND',
      });
    }
    const r = rows[0];
    return {
      id: r.id,
      reviewDueInDays: r.review_due_in_days,
      updatedAt: r.updated_at.toISOString(),
    };
  }

  async patchReminderPolicy(
    reviewDueInDays: number,
    expectedUpdatedAt: string,
  ): Promise<ReminderPolicyView> {
    const expected = new Date(expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) {
      throw new UnprocessableEntityException({
        message: 'expectedUpdatedAt is not a valid datetime',
        code: 'INVALID_EXPECTED_UPDATED_AT',
      });
    }
    const updated = (await this.dataSource.query(
      `UPDATE "email"."email_reminder_policy"
          SET "review_due_in_days" = $1, "updated_at" = now()
        WHERE "id" = 1 AND "updated_at" = $2::timestamptz
        RETURNING "id", "review_due_in_days", "updated_at"`,
      [reviewDueInDays, expected.toISOString()],
    )) as Array<{
      id: number;
      review_due_in_days: number;
      updated_at: Date;
    }>;
    if (updated.length === 0) {
      throw new ConflictException({
        message:
          'Reminder policy was changed by someone else. Refresh and try again.',
        code: 'EMAIL_POLICY_CONFLICT',
      });
    }
    const r = updated[0];
    return {
      id: r.id,
      reviewDueInDays: r.review_due_in_days,
      updatedAt: r.updated_at.toISOString(),
    };
  }

  async getTemplate(templateKey: string): Promise<EmailTemplateView> {
    this.assertTemplateKey(templateKey);
    const rows = (await this.dataSource.query(
      `SELECT template_key, subject_template, html_body, text_body, updated_at
         FROM "email"."email_template"
        WHERE template_key = $1
        LIMIT 1`,
      [templateKey],
    )) as Array<{
      template_key: string;
      subject_template: string;
      html_body: string;
      text_body: string;
      updated_at: Date;
    }>;
    if (rows.length === 0) {
      throw new NotFoundException({
        message: 'Email template not found',
        code: 'EMAIL_TEMPLATE_NOT_FOUND',
      });
    }
    const r = rows[0];
    return {
      templateKey: r.template_key,
      subjectTemplate: r.subject_template,
      htmlBody: r.html_body,
      textBody: r.text_body,
      updatedAt: r.updated_at.toISOString(),
    };
  }

  async patchTemplate(
    templateKey: string,
    subjectTemplate: string,
    htmlBody: string,
    textBody: string,
    expectedUpdatedAt: string,
  ): Promise<EmailTemplateView> {
    this.assertTemplateKey(templateKey);
    this.validateHandlebars(
      templateKey,
      subjectTemplate,
      htmlBody,
      textBody,
    );
    const expected = new Date(expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) {
      throw new UnprocessableEntityException({
        message: 'expectedUpdatedAt is not a valid datetime',
        code: 'INVALID_EXPECTED_UPDATED_AT',
      });
    }
    const updated = (await this.dataSource.query(
      `UPDATE "email"."email_template"
          SET "subject_template" = $1,
              "html_body" = $2,
              "text_body" = $3,
              "updated_at" = now()
        WHERE "template_key" = $4 AND "updated_at" = $5::timestamptz
        RETURNING "template_key", "subject_template", "html_body", "text_body", "updated_at"`,
      [
        subjectTemplate,
        htmlBody,
        textBody,
        templateKey,
        expected.toISOString(),
      ],
    )) as Array<{
      template_key: string;
      subject_template: string;
      html_body: string;
      text_body: string;
      updated_at: Date;
    }>;
    if (updated.length === 0) {
      throw new ConflictException({
        message:
          'Template was changed by someone else. Refresh and try again.',
        code: 'EMAIL_TEMPLATE_CONFLICT',
      });
    }
    const r = updated[0];
    return {
      templateKey: r.template_key,
      subjectTemplate: r.subject_template,
      htmlBody: r.html_body,
      textBody: r.text_body,
      updatedAt: r.updated_at.toISOString(),
    };
  }

  async previewTemplate(
    templateKey: string,
    isOverdue?: boolean,
  ): Promise<RenderedTemplateView> {
    this.assertTemplateKey(templateKey);
    const rows = (await this.dataSource.query(
      `SELECT subject_template, html_body, text_body
         FROM "email"."email_template"
        WHERE template_key = $1
        LIMIT 1`,
      [templateKey],
    )) as Array<{
      subject_template: string;
      html_body: string;
      text_body: string;
    }>;
    if (rows.length === 0) {
      throw new NotFoundException({
        message: 'Email template not found',
        code: 'EMAIL_TEMPLATE_NOT_FOUND',
      });
    }
    const r = rows[0];
    const base = { ...PREVIEW_CONTEXT[templateKey] };
    if (templateKey === 'reminder-due' && typeof isOverdue === 'boolean') {
      base.isOverdue = isOverdue;
    }
    try {
      const subject = Handlebars.compile(r.subject_template)(base);
      const html = Handlebars.compile(r.html_body)(base);
      const text = Handlebars.compile(r.text_body)(base);
      return { subject, html, text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new UnprocessableEntityException({
        message: `Template render failed: ${msg}`,
        code: 'TEMPLATE_RENDER_ERROR',
      });
    }
  }
}
