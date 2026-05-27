import { readFileSync } from 'fs';
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
] as const;

const AR_STYLED_KEYS = ['reviewer-invited', 'reminder-due'] as const;

/**
 * Refresh DB template bodies from disk after Folio branded layout rollout.
 * English rows use `templates/*.html.hbs`; Arabic reviewer/reminder use `templates/ar/`.
 * Other `ar` rows reuse the English styled HTML with rtl/lang on the layout wrapper.
 */
export class EmailTemplateStyledLayout1714600000009
  implements MigrationInterface
{
  name = 'EmailTemplateStyledLayout1714600000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const templatesRoot = join(__dirname, '..', '..', '..', 'templates');

    for (const key of TEMPLATE_KEYS) {
      const html = readFileSync(
        join(templatesRoot, `${key}.html.hbs`),
        'utf8',
      );
      await queryRunner.query(
        `
        UPDATE "email"."email_template"
           SET "html_body" = $1,
               "updated_at" = now()
         WHERE "template_key" = $2
           AND "locale" = 'en'
      `,
        [html, key],
      );
    }

    for (const key of AR_STYLED_KEYS) {
      const html = readFileSync(
        join(templatesRoot, 'ar', `${key}.html.hbs`),
        'utf8',
      );
      await queryRunner.query(
        `
        UPDATE "email"."email_template"
           SET "html_body" = $1,
               "updated_at" = now()
         WHERE "template_key" = $2
           AND "locale" = 'ar'
      `,
        [html, key],
      );
    }

    for (const key of TEMPLATE_KEYS) {
      if ((AR_STYLED_KEYS as readonly string[]).includes(key)) continue;
      let html = readFileSync(
        join(templatesRoot, `${key}.html.hbs`),
        'utf8',
      );
      html = html.replace(
        '{{#> folio-email-layout dir="ltr" lang="en"}}',
        '{{#> folio-email-layout dir="rtl" lang="ar"}}',
      );
      html = html.replace(/align="left"/g, 'align="right"');
      html = html.replace(/border-left:4px/g, 'border-right:4px');
      await queryRunner.query(
        `
        UPDATE "email"."email_template"
           SET "html_body" = $1,
               "updated_at" = now()
         WHERE "template_key" = $2
           AND "locale" = 'ar'
      `,
        [html, key],
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Irreversible: prior unstyled bodies are not retained.
  }
}
