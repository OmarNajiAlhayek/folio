import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Locale-specific email templates (composite PK) + reminder.email_locale snapshot.
 */
export class EmailTemplateLocaleReminderLocale1714600000002
  implements MigrationInterface
{
  name = 'EmailTemplateLocaleReminderLocale1714600000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email"."reminder"
        ADD COLUMN IF NOT EXISTS "email_locale" varchar(10) NOT NULL DEFAULT 'en'
    `);

    await queryRunner.query(`
      ALTER TABLE "email"."email_template" DROP CONSTRAINT IF EXISTS "pk_email_template"
    `);

    await queryRunner.query(`
      ALTER TABLE "email"."email_template"
        ADD COLUMN IF NOT EXISTS "locale" varchar(10) NOT NULL DEFAULT 'en'
    `);

    await queryRunner.query(`
      UPDATE "email"."email_template" SET "locale" = 'en' WHERE "locale" IS NULL OR "locale" = ''
    `);

    await queryRunner.query(`
      INSERT INTO "email"."email_template"
        ("template_key", "subject_template", "html_body", "text_body", "locale", "updated_at")
      SELECT "template_key", "subject_template", "html_body", "text_body", 'ar', now()
        FROM "email"."email_template" e
       WHERE e."locale" = 'en'
         AND NOT EXISTS (
           SELECT 1 FROM "email"."email_template" a
            WHERE a."template_key" = e."template_key" AND a."locale" = 'ar'
         )
    `);

    await queryRunner.query(`
      ALTER TABLE "email"."email_template"
        ADD CONSTRAINT "pk_email_template" PRIMARY KEY ("template_key", "locale")
    `);

    await queryRunner.query(`
      ALTER TABLE "email"."email_template"
        ALTER COLUMN "locale" DROP DEFAULT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email"."email_template" DROP CONSTRAINT IF EXISTS "pk_email_template"
    `);
    await queryRunner.query(`
      DELETE FROM "email"."email_template" WHERE "locale" <> 'en'
    `);
    await queryRunner.query(`
      ALTER TABLE "email"."email_template" DROP COLUMN IF EXISTS "locale"
    `);
    await queryRunner.query(`
      ALTER TABLE "email"."email_template"
        ADD CONSTRAINT "pk_email_template" PRIMARY KEY ("template_key")
    `);

    await queryRunner.query(`
      ALTER TABLE "email"."reminder" DROP COLUMN IF EXISTS "email_locale"
    `);
  }
}
