import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

const TEMPLATE_KEYS = [
  'reviewer-invited',
  'reminder-due',
  'copyedit-assigned',
  'copyedit-queries-sent',
  'copyedit-author-ready',
  'submission-submitted',
  'submission-decision',
  'submission-under-review',
  'review-submitted',
  'review-invitation-accepted',
  'review-invitation-declined',
  'submission-published',
  'role-invitation',
  'auth-verification-otp',
  'auth-password-reset',
  'auth-registration-welcome',
] as const;

const SUBJECTS_EN: Record<(typeof TEMPLATE_KEYS)[number], string> = {
  'reviewer-invited':
    'Review invitation: {{#if submissionTitle}}{{submissionTitle}}{{else}}journal manuscript{{/if}}',
  'reminder-due':
    '{{#if isOverdue}}Overdue review: {{#if submissionTitle}}{{submissionTitle}}{{else}}journal manuscript{{/if}}{{else}}Reminder: review due for {{#if submissionTitle}}{{submissionTitle}}{{else}}journal manuscript{{/if}}{{/if}}',
  'copyedit-assigned': 'Copyediting assignment: {{submissionTitle}}',
  'copyedit-queries-sent':
    'Copyedit requests (round {{round}}): {{submissionTitle}}',
  'copyedit-author-ready':
    'Author ready for copyedit review: {{submissionTitle}}',
  'submission-submitted':
    '{{#if isResubmission}}Revised manuscript submitted{{else}}New submission received{{/if}}: {{submissionTitle}}',
  'submission-decision': 'Editorial decision: {{submissionTitle}}',
  'submission-under-review': 'Under peer review: {{submissionTitle}}',
  'review-submitted': 'Review submitted: {{submissionTitle}}',
  'review-invitation-accepted': 'Reviewer accepted: {{submissionTitle}}',
  'review-invitation-declined': 'Reviewer declined: {{submissionTitle}}',
  'submission-published': 'Published: {{submissionTitle}}',
  'role-invitation':
    'Invitation to join Damascus University Journal as {{roleLabel}}',
  'auth-verification-otp':
    'Your Damascus University Journal verification code: {{otpCode}}',
  'auth-password-reset': 'Reset your Damascus University Journal password',
  'auth-registration-welcome': 'Welcome to Damascus University Journal',
};

/**
 * Refresh stored email templates after Damascus University Journal display rebrand.
 * Bodies are re-read from disk; English subjects are set to canonical strings.
 */
export class RebrandEmailTemplates1781600000000 implements MigrationInterface {
  name = 'RebrandEmailTemplates1781600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const templatesRoot = join(__dirname, '..', '..', '..', 'templates');

    for (const key of TEMPLATE_KEYS) {
      const html = readFileSync(join(templatesRoot, `${key}.html.hbs`), 'utf8');
      const text = readFileSync(join(templatesRoot, `${key}.text.hbs`), 'utf8');

      await queryRunner.query(
        `
        UPDATE "email"."email_template"
           SET "subject_template" = $1,
               "html_body" = $2,
               "text_body" = $3,
               "updated_at" = now()
         WHERE "template_key" = $4
           AND "locale" = 'en'
      `,
        [SUBJECTS_EN[key], html, text, key],
      );
    }

    for (const key of TEMPLATE_KEYS) {
      const arHtmlPath = join(templatesRoot, 'ar', `${key}.html.hbs`);
      let html: string;
      if (existsSync(arHtmlPath)) {
        html = readFileSync(arHtmlPath, 'utf8');
      } else {
        html = readFileSync(join(templatesRoot, `${key}.html.hbs`), 'utf8');
        html = html.replace(
          '{{#> folio-email-layout dir="ltr" lang="en"}}',
          '{{#> folio-email-layout dir="rtl" lang="ar"}}',
        );
        html = html.replace(/align="left"/g, 'align="right"');
        html = html.replace(/border-left:4px/g, 'border-right:4px');
      }

      const text = readFileSync(join(templatesRoot, `${key}.text.hbs`), 'utf8');

      await queryRunner.query(
        `
        UPDATE "email"."email_template"
           SET "html_body" = $1,
               "text_body" = $2,
               "updated_at" = now()
         WHERE "template_key" = $3
           AND "locale" = 'ar'
      `,
        [html, text, key],
      );
    }

    // Arabic subject lines that embed the old brand name.
    await queryRunner.query(`
      UPDATE "email"."email_template"
         SET "subject_template" = REPLACE("subject_template", 'مخطوطة Folio', 'مخطوطة المجلة'),
             "updated_at" = now()
       WHERE "locale" = 'ar'
         AND "subject_template" LIKE '%Folio%'
    `);
    await queryRunner.query(`
      UPDATE "email"."email_template"
         SET "subject_template" = REPLACE("subject_template", 'Folio', 'مجلة جامعة دمشق'),
             "updated_at" = now()
       WHERE "locale" = 'ar'
         AND "subject_template" LIKE '%Folio%'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Irreversible: prior Folio-branded copy is not retained.
  }
}
