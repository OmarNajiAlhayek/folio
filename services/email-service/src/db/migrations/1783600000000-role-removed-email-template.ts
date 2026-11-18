import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

const NEW_KEY = 'role-removed';

const ALL_KEYS = [
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
  NEW_KEY,
] as const;

const SUBJECT_EN = 'Your role on Damascus University Journal was removed';
const SUBJECT_AR = 'أُزيل دورك في مجلة جامعة دمشق';

/** Adds the mail sent to someone whose role a journal manager removed. */
export class RoleRemovedEmailTemplate1783600000000
  implements MigrationInterface
{
  name = 'RoleRemovedEmailTemplate1783600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email"."email_template"
      DROP CONSTRAINT IF EXISTS "ck_email_template_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "email"."email_template"
      ADD CONSTRAINT "ck_email_template_key" CHECK (
        "template_key" IN (${ALL_KEYS.map((k) => `'${k}'`).join(', ')})
      )
    `);

    const root = join(__dirname, '..', '..', '..', 'templates');
    const rows = [
      {
        locale: 'en',
        subject: SUBJECT_EN,
        html: readFileSync(join(root, `${NEW_KEY}.html.hbs`), 'utf8'),
        text: readFileSync(join(root, `${NEW_KEY}.text.hbs`), 'utf8'),
      },
      {
        locale: 'ar',
        subject: SUBJECT_AR,
        html: readFileSync(join(root, 'ar', `${NEW_KEY}.html.hbs`), 'utf8'),
        text: readFileSync(join(root, 'ar', `${NEW_KEY}.text.hbs`), 'utf8'),
      },
    ];
    for (const row of rows) {
      await queryRunner.query(
        `
        INSERT INTO "email"."email_template"
          ("template_key", "locale", "subject_template", "html_body", "text_body", "updated_at")
        VALUES ($1, $2, $3, $4, $5, now())
        ON CONFLICT ("template_key", "locale") DO NOTHING
        `,
        [NEW_KEY, row.locale, row.subject, row.html, row.text],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "email"."email_template" WHERE "template_key" = '${NEW_KEY}'
    `);
    const legacyKeys = ALL_KEYS.filter((k) => k !== NEW_KEY);
    await queryRunner.query(`
      ALTER TABLE "email"."email_template"
      DROP CONSTRAINT IF EXISTS "ck_email_template_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "email"."email_template"
      ADD CONSTRAINT "ck_email_template_key" CHECK (
        "template_key" IN (${legacyKeys.map((k) => `'${k}'`).join(', ')})
      )
    `);
  }
}
