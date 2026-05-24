import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubmissionPhase2EmailTemplates1714600000005
  implements MigrationInterface
{
  name = 'SubmissionPhase2EmailTemplates1714600000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email"."email_template"
      DROP CONSTRAINT IF EXISTS "ck_email_template_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "email"."email_template"
      ADD CONSTRAINT "ck_email_template_key" CHECK (
        "template_key" IN (
          'reviewer-invited',
          'reminder-due',
          'copyedit-assigned',
          'copyedit-queries-sent',
          'copyedit-author-ready',
          'submission-submitted',
          'submission-decision'
        )
      )
    `);

    const templatesRoot = join(__dirname, '..', '..', '..', 'templates');
    const readPair = (base: string) => ({
      html: readFileSync(join(templatesRoot, `${base}.html.hbs`), 'utf8'),
      text: readFileSync(join(templatesRoot, `${base}.text.hbs`), 'utf8'),
    });
    const submitted = readPair('submission-submitted');
    const decision = readPair('submission-decision');

    const inserts: Array<[string, string, string, string]> = [
      [
        'submission-submitted',
        '{{#if isResubmission}}Revised manuscript submitted{{else}}New submission received{{/if}}: {{submissionTitle}}',
        submitted.html,
        submitted.text,
      ],
      [
        'submission-decision',
        'Editorial decision: {{submissionTitle}}',
        decision.html,
        decision.text,
      ],
    ];

    for (const [key, subject, html, text] of inserts) {
      await queryRunner.query(
        `
        INSERT INTO "email"."email_template"
          ("template_key", "locale", "subject_template", "html_body", "text_body", "updated_at")
        VALUES ($1, 'en', $2, $3, $4, now())
        ON CONFLICT ("template_key", "locale") DO NOTHING
        `,
        [key, subject, html, text],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "email"."email_template"
      WHERE "template_key" IN ('submission-submitted', 'submission-decision')
    `);
    await queryRunner.query(`
      ALTER TABLE "email"."email_template"
      DROP CONSTRAINT IF EXISTS "ck_email_template_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "email"."email_template"
      ADD CONSTRAINT "ck_email_template_key" CHECK (
        "template_key" IN (
          'reviewer-invited',
          'reminder-due',
          'copyedit-assigned',
          'copyedit-queries-sent',
          'copyedit-author-ready'
        )
      )
    `);
  }
}
