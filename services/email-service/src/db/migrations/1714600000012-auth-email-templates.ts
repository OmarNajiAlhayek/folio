import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

const NEW_KEYS = ['auth-verification-otp', 'auth-password-reset'] as const;

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
  ...NEW_KEYS,
] as const;

export class AuthEmailTemplates1714600000012 implements MigrationInterface {
  name = 'AuthEmailTemplates1714600000012';

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
    const readPair = (base: string) => ({
      html: readFileSync(join(templatesRoot, `${base}.html.hbs`), 'utf8'),
      text: readFileSync(join(templatesRoot, `${base}.text.hbs`), 'utf8'),
    });

    const subjects: Record<(typeof NEW_KEYS)[number], string> = {
      'auth-verification-otp': 'Your Folio verification code: {{otpCode}}',
      'auth-password-reset': 'Reset your Folio password',
    };

    for (const key of NEW_KEYS) {
      const { html, text } = readPair(key);
      await queryRunner.query(
        `
        INSERT INTO "email"."email_template"
          ("template_key", "locale", "subject_template", "html_body", "text_body", "updated_at")
        VALUES ($1, 'en', $2, $3, $4, now())
        ON CONFLICT ("template_key", "locale") DO NOTHING
        `,
        [key, subjects[key], html, text],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "email"."email_template"
      WHERE "template_key" IN (${NEW_KEYS.map((k) => `'${k}'`).join(', ')})
    `);
    const legacyKeys = ALL_KEYS.filter(
      (k) => !NEW_KEYS.includes(k as (typeof NEW_KEYS)[number]),
    );
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
