import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Refresh submission-decision template bodies to distinguish desk rejection
 * (submitted → rejected, before review) from post-review rejection.
 */
export class SubmissionDecisionDeskReject1782600000000 implements MigrationInterface {
  name = 'SubmissionDecisionDeskReject1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const templatesRoot = join(__dirname, '..', '..', '..', 'templates');
    const html = readFileSync(
      join(templatesRoot, 'submission-decision.html.hbs'),
      'utf8',
    );
    const text = readFileSync(
      join(templatesRoot, 'submission-decision.text.hbs'),
      'utf8',
    );

    await queryRunner.query(
      `
      UPDATE "email"."email_template"
         SET "html_body" = $1,
             "text_body" = $2,
             "updated_at" = now()
       WHERE "template_key" = 'submission-decision'
         AND "locale" = 'en'
    `,
      [html, text],
    );

    let arHtml = html.replace(
      '{{#> folio-email-layout dir="ltr" lang="en"}}',
      '{{#> folio-email-layout dir="rtl" lang="ar"}}',
    );
    arHtml = arHtml.replace(/align="left"/g, 'align="right"');
    arHtml = arHtml.replace('Message from the editor', 'رسالة من المحرر');

    await queryRunner.query(
      `
      UPDATE "email"."email_template"
         SET "html_body" = $1,
             "text_body" = $2,
             "updated_at" = now()
       WHERE "template_key" = 'submission-decision'
         AND "locale" = 'ar'
    `,
      [arHtml, text],
    );
  }

  public async down(): Promise<void> {
    // Non-reversible: prior template bodies are not archived.
  }
}
