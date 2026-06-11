import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

const NEW_KEY = 'auth-registration-welcome';

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
  NEW_KEY,
] as const;

export class AuthRegistrationWelcomeTemplate1714600000014 implements MigrationInterface {
  name = 'AuthRegistrationWelcomeTemplate1714600000014';

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

    const templatesRoot = join(__dirname, '..', '..', '..', 'templates');
    const html = readFileSync(
      join(templatesRoot, `${NEW_KEY}.html.hbs`),
      'utf8',
    );
    const text = readFileSync(
      join(templatesRoot, `${NEW_KEY}.text.hbs`),
      'utf8',
    );

    await queryRunner.query(
      `
      INSERT INTO "email"."email_template"
        ("template_key", "locale", "subject_template", "html_body", "text_body", "updated_at")
      VALUES ($1, 'en', $2, $3, $4, now())
      ON CONFLICT ("template_key", "locale") DO NOTHING
      `,
      [NEW_KEY, 'Welcome to Folio', html, text],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "email"."email_template"
      WHERE "template_key" = '${NEW_KEY}'
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
