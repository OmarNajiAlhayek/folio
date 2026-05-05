import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin-editable email templates and global reminder policy (singleton).
 * Seeds from existing `templates/*.hbs` and default review_due_in_days=21.
 */
export class EmailTemplatesAndPolicy1714600000001
  implements MigrationInterface
{
  name = 'EmailTemplatesAndPolicy1714600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email"."email_template" (
        "template_key"     varchar(64)  NOT NULL,
        "subject_template" text           NOT NULL,
        "html_body"        text           NOT NULL,
        "text_body"        text           NOT NULL,
        "updated_at"       timestamptz    NOT NULL DEFAULT now(),
        CONSTRAINT "pk_email_template" PRIMARY KEY ("template_key"),
        CONSTRAINT "ck_email_template_key" CHECK (
          "template_key" IN ('reviewer-invited', 'reminder-due')
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email"."email_reminder_policy" (
        "id"                    smallint      NOT NULL DEFAULT 1,
        "review_due_in_days"  int           NOT NULL,
        "updated_at"            timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "pk_email_reminder_policy" PRIMARY KEY ("id"),
        CONSTRAINT "ck_email_reminder_policy_singleton" CHECK ("id" = 1),
        CONSTRAINT "ck_email_reminder_policy_days" CHECK ("review_due_in_days" > 3)
      )
    `);

    const templatesRoot = join(__dirname, '..', '..', '..', 'templates');
    const ri = {
      html: readFileSync(
        join(templatesRoot, 'reviewer-invited.html.hbs'),
        'utf8',
      ),
      text: readFileSync(
        join(templatesRoot, 'reviewer-invited.text.hbs'),
        'utf8',
      ),
    };
    const rd = {
      html: readFileSync(join(templatesRoot, 'reminder-due.html.hbs'), 'utf8'),
      text: readFileSync(join(templatesRoot, 'reminder-due.text.hbs'), 'utf8'),
    };

    const subjectReviewer = `Review invitation: {{#if submissionTitle}}{{submissionTitle}}{{else}}Folio manuscript{{/if}}`;
    const subjectReminder = `{{#if isOverdue}}Overdue review: {{#if submissionTitle}}{{submissionTitle}}{{else}}Folio manuscript{{/if}}{{else}}Reminder: review due for {{#if submissionTitle}}{{submissionTitle}}{{else}}Folio manuscript{{/if}}{{/if}}`;

    await queryRunner.query(
      `
      INSERT INTO "email"."email_template"
        ("template_key", "subject_template", "html_body", "text_body", "updated_at")
      VALUES
        ($1, $2, $3, $4, now()),
        ($5, $6, $7, $8, now())
      ON CONFLICT ("template_key") DO NOTHING
    `,
      [
        'reviewer-invited',
        subjectReviewer,
        ri.html,
        ri.text,
        'reminder-due',
        subjectReminder,
        rd.html,
        rd.text,
      ],
    );

    await queryRunner.query(`
      INSERT INTO "email"."email_reminder_policy" ("id", "review_due_in_days", "updated_at")
      VALUES (1, 21, now())
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email"."email_reminder_policy"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email"."email_template"`);
  }
}
