import * as Handlebars from 'handlebars';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
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
  locale: string;
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
  'copyedit-assigned': {
    copyeditorDisplayName: 'P. Copyeditor',
    submissionTitle: 'Sample manuscript title (preview)',
    workbenchUrl: 'https://example.org/preview/copyedit-assignments/ce-preview',
    assignedByDisplayName: 'Editor Example',
  },
  'copyedit-queries-sent': {
    authorDisplayName: 'Author Example',
    copyeditorDisplayName: 'P. Copyeditor',
    submissionTitle: 'Sample manuscript title (preview)',
    round: 1,
    noteExcerpt: 'Please revise the abstract wording on page 2.',
    submissionUrl: 'https://example.org/preview/submissions/sample',
  },
  'copyedit-author-ready': {
    copyeditorDisplayName: 'P. Copyeditor',
    authorDisplayName: 'Author Example',
    submissionTitle: 'Sample manuscript title (preview)',
    round: 1,
    workbenchUrl: 'https://example.org/preview/copyedit-assignments/ce-preview',
  },
  'submission-submitted': {
    editorDisplayName: 'Editor Example',
    authorDisplayName: 'Author Example',
    submissionTitle: 'Sample manuscript title (preview)',
    isResubmission: false,
    editorQueueUrl: 'https://example.org/preview/submissions/sample',
  },
  'submission-decision': {
    authorDisplayName: 'Author Example',
    submissionTitle: 'Sample manuscript title (preview)',
    submissionUrl: 'https://example.org/preview/submissions/sample',
    decidedByDisplayName: 'Editor Example',
    isAccepted: true,
    isRejected: false,
    isRevisionsRequested: false,
  },
};

@Injectable()
export class AdminEmailService {
  private readonly logger = new Logger(AdminEmailService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Maps Postgres permission errors to a stable HTTP response; rethrows otherwise. */
  private rethrowUnlessPermissionDenied(err: unknown): never {
    const driverErr = this.getPgDriverError(err);
    const message =
      driverErr?.message ??
      (err instanceof Error ? err.message : '') ??
      '';
    const code =
      driverErr?.code ??
      (typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      typeof (err as { code?: string }).code === 'string'
        ? (err as { code: string }).code
        : undefined);
    const looksLikeQueryFailed =
      err instanceof QueryFailedError ||
      (typeof err === 'object' &&
        err !== null &&
        (err as { name?: string }).name === 'QueryFailedError') ||
      driverErr !== undefined;

    if (
      looksLikeQueryFailed &&
      (code === '42501' || /permission denied/i.test(message))
    ) {
      this.logger.error(
        `Email admin DB permission denied: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new ForbiddenException({
        message:
          'Database permission denied for this operation. Apply grants for the app DB role (see backend/scripts/grant-email-reminder-admin.sql).',
        code: 'EMAIL_DB_FORBIDDEN',
      });
    }
    throw err;
  }

  private getPgDriverError(
    err: unknown,
  ): { code?: string; message?: string } | undefined {
    if (err instanceof QueryFailedError) {
      return err.driverError as { code?: string; message?: string };
    }
    if (
      typeof err === 'object' &&
      err !== null &&
      'driverError' in err &&
      typeof (err as { driverError?: unknown }).driverError === 'object' &&
      (err as { driverError?: unknown }).driverError !== null
    ) {
      return (err as { driverError: { code?: string; message?: string } })
        .driverError;
    }
    return undefined;
  }

  /**
   * PostgresQueryRunner returns `[rows, rowCount]` for UPDATE/DELETE raw queries,
   * but a plain row array for SELECT. Normalize to a row array.
   */
  private unwrapPgQueryRows<T>(result: unknown): T[] {
    if (
      Array.isArray(result) &&
      result.length === 2 &&
      typeof result[1] === 'number' &&
      Array.isArray(result[0])
    ) {
      return result[0] as T[];
    }
    return result as T[];
  }

  /**
   * Raw query rows may carry timestamptz as `Date`, ISO string, or under
   * `updatedAt` / `updated_at` depending on driver and TypeORM/pg settings.
   */
  private isoFromRowTimestamptz(row: Record<string, unknown>): string {
    const direct =
      row.updated_at ??
      row.Updated_at ??
      row.updatedAt ??
      row.UpdatedAt;
    const tryVal = (v: unknown): string | null => {
      if (v instanceof Date && !Number.isNaN(v.getTime())) {
        return v.toISOString();
      }
      if (typeof v === 'string') {
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
      }
      return null;
    };
    const fromDirect = tryVal(direct);
    if (fromDirect) return fromDirect;
    for (const [key, val] of Object.entries(row)) {
      if (!/updated/i.test(key)) continue;
      const parsed = tryVal(val);
      if (parsed) return parsed;
    }
    this.logger.error(
      `Could not parse timestamptz; keys=${Object.keys(row).join(',')}`,
    );
    throw new InternalServerErrorException({
      message: 'Unexpected database row shape for timestamp',
      code: 'EMAIL_ROW_TIMESTAMP',
    });
  }

  assertTemplateKey(key: string): asserts key is AdminEmailTemplateKey {
    if (!isAdminEmailTemplateKey(key)) {
      throw new UnprocessableEntityException({
        message: 'Invalid email template key',
        code: 'INVALID_TEMPLATE_KEY',
      });
    }
  }

  private normalizeTemplateLocale(localeRaw?: string): 'en' | 'ar' {
    return localeRaw === 'ar' ? 'ar' : 'en';
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
      updatedAt: this.isoFromRowTimestamptz(r as Record<string, unknown>),
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
    let updated: Array<{
      id: number;
      review_due_in_days: number;
      updated_at: Date;
    }>;
    try {
      const raw = await this.dataSource.query(
        `UPDATE "email"."email_reminder_policy"
            SET "review_due_in_days" = $1, "updated_at" = now()
          WHERE "id" = 1 AND "updated_at" = $2::timestamptz
          RETURNING "id", "review_due_in_days", "updated_at"`,
        [reviewDueInDays, expected.toISOString()],
      );
      updated = this.unwrapPgQueryRows(raw) as Array<{
        id: number;
        review_due_in_days: number;
        updated_at: Date;
      }>;
    } catch (e) {
      this.rethrowUnlessPermissionDenied(e);
    }
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
      updatedAt: this.isoFromRowTimestamptz(r as Record<string, unknown>),
    };
  }

  async getTemplate(
    templateKey: string,
    localeRaw?: string,
  ): Promise<EmailTemplateView> {
    this.assertTemplateKey(templateKey);
    const locale = this.normalizeTemplateLocale(localeRaw);
    const rows = (await this.dataSource.query(
      `SELECT template_key, locale, subject_template, html_body, text_body, updated_at
         FROM "email"."email_template"
        WHERE template_key = $1 AND locale = $2
        LIMIT 1`,
      [templateKey, locale],
    )) as Array<{
      template_key: string;
      locale: string;
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
      locale: r.locale,
      subjectTemplate: r.subject_template,
      htmlBody: r.html_body,
      textBody: r.text_body,
      updatedAt: this.isoFromRowTimestamptz(r as Record<string, unknown>),
    };
  }

  async patchTemplate(
    templateKey: string,
    localeRaw: string | undefined,
    subjectTemplate: string,
    htmlBody: string,
    textBody: string,
    expectedUpdatedAt: string,
  ): Promise<EmailTemplateView> {
    this.assertTemplateKey(templateKey);
    const locale = this.normalizeTemplateLocale(localeRaw);
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
    let updated: Array<{
      template_key: string;
      locale: string;
      subject_template: string;
      html_body: string;
      text_body: string;
      updated_at: Date;
    }>;
    try {
      const raw = await this.dataSource.query(
        `UPDATE "email"."email_template"
            SET "subject_template" = $1,
                "html_body" = $2,
                "text_body" = $3,
                "updated_at" = now()
          WHERE "template_key" = $4 AND "locale" = $5 AND "updated_at" = $6::timestamptz
          RETURNING "template_key", "locale", "subject_template", "html_body", "text_body", "updated_at"`,
        [
          subjectTemplate,
          htmlBody,
          textBody,
          templateKey,
          locale,
          expected.toISOString(),
        ],
      );
      updated = this.unwrapPgQueryRows(raw) as Array<{
        template_key: string;
        locale: string;
        subject_template: string;
        html_body: string;
        text_body: string;
        updated_at: Date;
      }>;
    } catch (e) {
      this.rethrowUnlessPermissionDenied(e);
    }
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
      locale: r.locale,
      subjectTemplate: r.subject_template,
      htmlBody: r.html_body,
      textBody: r.text_body,
      updatedAt: this.isoFromRowTimestamptz(r as Record<string, unknown>),
    };
  }

  async previewTemplate(
    templateKey: string,
    isOverdue: boolean | undefined,
    localeRaw?: string,
  ): Promise<RenderedTemplateView> {
    this.assertTemplateKey(templateKey);
    let locale = this.normalizeTemplateLocale(localeRaw);
    let rows = (await this.dataSource.query(
      `SELECT subject_template, html_body, text_body
         FROM "email"."email_template"
        WHERE template_key = $1 AND locale = $2
        LIMIT 1`,
      [templateKey, locale],
    )) as Array<{
      subject_template: string;
      html_body: string;
      text_body: string;
    }>;
    if (rows.length === 0 && locale === 'ar') {
      locale = 'en';
      rows = (await this.dataSource.query(
        `SELECT subject_template, html_body, text_body
           FROM "email"."email_template"
          WHERE template_key = $1 AND locale = $2
          LIMIT 1`,
        [templateKey, locale],
      )) as Array<{
        subject_template: string;
        html_body: string;
        text_body: string;
      }>;
    }
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
