import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Refresh submission-decision template bodies so a revision request states its
 * severity (minor vs major) and mentions any reviewer files released with it.
 */
export class SubmissionDecisionRevisionSeverity1782900000000 implements MigrationInterface {
  name = 'SubmissionDecisionRevisionSeverity1782900000000';

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
    arHtml = arHtml.replace(
      'The editor has requested <strong style="color:#92400e;">major revisions</strong> for your manuscript <strong>{{submissionTitle}}</strong>. Substantial changes are needed, and the revised manuscript may be sent back to the reviewers.',
      'طلب المحرر <strong style="color:#92400e;">تعديلات جوهرية</strong> على مخطوطتك <strong>{{submissionTitle}}</strong>. المطلوب إجراء تغييرات كبيرة، وقد تُعاد المخطوطة المنقّحة إلى المحكّمين.',
    );
    arHtml = arHtml.replace(
      'The editor has requested <strong style="color:#92400e;">minor revisions</strong> for your manuscript <strong>{{submissionTitle}}</strong>. The changes required are limited in scope.',
      'طلب المحرر <strong style="color:#92400e;">تعديلات طفيفة</strong> على مخطوطتك <strong>{{submissionTitle}}</strong>. التغييرات المطلوبة محدودة النطاق.',
    );
    arHtml = arHtml.replace(
      '<strong>{{reviewFileCount}}</strong> reviewer file(s) have been shared with you. You can download them from your submission page.',
      'تمت مشاركة <strong>{{reviewFileCount}}</strong> من ملفات المحكّمين معك. يمكنك تنزيلها من صفحة مشاركتك.',
    );

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
