import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migrations 000004/000005 inserted copyedit and workflow templates for `en` only.
 * Copy them into `ar` rows so admin locale tabs can load every template.
 */
export class ArEmailTemplateMissingLocaleCopy1714600000006
  implements MigrationInterface
{
  name = 'ArEmailTemplateMissingLocaleCopy1714600000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "email"."email_template"
        ("template_key", "subject_template", "html_body", "text_body", "locale", "updated_at")
      SELECT e."template_key", e."subject_template", e."html_body", e."text_body", 'ar', now()
        FROM "email"."email_template" e
       WHERE e."locale" = 'en'
         AND NOT EXISTS (
           SELECT 1 FROM "email"."email_template" a
            WHERE a."template_key" = e."template_key" AND a."locale" = 'ar'
         )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "email"."email_template" AS ar
       WHERE ar."locale" = 'ar'
         AND ar."template_key" IN (
           'copyedit-assigned',
           'copyedit-queries-sent',
           'copyedit-author-ready',
           'submission-submitted',
           'submission-decision'
         )
         AND EXISTS (
           SELECT 1 FROM "email"."email_template" en
            WHERE en."template_key" = ar."template_key"
              AND en."locale" = 'en'
              AND en."subject_template" = ar."subject_template"
              AND en."html_body" = ar."html_body"
              AND en."text_body" = ar."text_body"
         )
    `);
  }
}
