import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Default Arabic prose for locale=ar rows. Migration 000002 copied English
 * into `ar` rows; replace with real Arabic so admin tabs show distinct content.
 */
export class ArEmailTemplateDefaultCopy1714600000003
  implements MigrationInterface
{
  name = 'ArEmailTemplateDefaultCopy1714600000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const reviewerSubject =
      'دعوة تحكيم: {{#if submissionTitle}}{{submissionTitle}}{{else}}مخطوطة Folio{{/if}}';

    const reviewerHtml = `<!doctype html>
<html dir="rtl" lang="ar">
  <body>
    <p>مرحبًا {{reviewerDisplayName}}،</p>
    <p>
      تمت دعوتك لتحكيم المخطوطة
      <strong>{{submissionTitle}}</strong> في مجلة Folio.
    </p>
    <p>
      يمكنك قبول الدعوة عبر
      <a href="{{acceptUrl}}">هذا الرابط</a>، أو رفضها من
      <a href="{{declineUrl}}">هنا</a>.
    </p>
    <p>مع الشكر،<br />فريق تحرير Folio</p>
  </body>
</html>`;

    const reviewerText = `مرحبًا {{reviewerDisplayName}}،

تمت دعوتك لتحكيم المخطوطة "{{submissionTitle}}" في مجلة Folio.

قبول الدعوة: {{acceptUrl}}
رفض الدعوة: {{declineUrl}}

مع الشكر،
فريق تحرير Folio
`;

    const reminderSubject =
      '{{#if isOverdue}}مراجعة متأخرة: {{#if submissionTitle}}{{submissionTitle}}{{else}}مخطوطة Folio{{/if}}{{else}}تذكير: موعد تسليم المراجعة {{#if submissionTitle}}{{submissionTitle}}{{else}}مخطوطة Folio{{/if}}{{/if}}';

    const reminderHtml = `<!doctype html>
<html dir="rtl" lang="ar">
  <body>
    <p>مرحبًا {{reviewerDisplayName}}،</p>
    {{#if isOverdue}}
      <p>
        كانت مراجعتك لمخطوطة <strong>{{submissionTitle}}</strong> مستحقّة في
        {{dueAt}} وهي الآن متأخرة. يُرجى إكمالها في أقرب وقت، أو التواصل مع المحرّر إن لم يعد بإمكانك التحكيم.
      </p>
    {{else}}
      <p>
        تذكير ودي: موعد تسليم مراجعتك لمخطوطة
        <strong>{{submissionTitle}}</strong> هو {{dueAt}}.
      </p>
    {{/if}}
    <p>
      يمكنك فتح المهمّة هنا:
      <a href="{{assignmentUrl}}">{{assignmentUrl}}</a>
    </p>
    <p>مع الشكر،<br />فريق تحرير Folio</p>
  </body>
</html>`;

    const reminderText = `مرحبًا {{reviewerDisplayName}}،

{{#if isOverdue}}
كانت مراجعتك لمخطوطة "{{submissionTitle}}" مستحقّة في {{dueAt}} وهي الآن متأخرة. يُرجى إكمالها في أقرب وقت، أو التواصل مع المحرّر إن لم يعد بإمكانك التحكيم.
{{else}}
تذكير ودي: موعد تسليم مراجعتك لمخطوطة "{{submissionTitle}}" هو {{dueAt}}.
{{/if}}

فتح المهمّة: {{assignmentUrl}}

مع الشكر،
فريق تحرير Folio
`;

    await queryRunner.query(
      `UPDATE "email"."email_template"
          SET "subject_template" = $1,
              "html_body" = $2,
              "text_body" = $3,
              "updated_at" = now()
        WHERE "template_key" = $4 AND "locale" = 'ar'`,
      [reviewerSubject, reviewerHtml, reviewerText, 'reviewer-invited'],
    );

    await queryRunner.query(
      `UPDATE "email"."email_template"
          SET "subject_template" = $1,
              "html_body" = $2,
              "text_body" = $3,
              "updated_at" = now()
        WHERE "template_key" = $4 AND "locale" = 'ar'`,
      [reminderSubject, reminderHtml, reminderText, 'reminder-due'],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "email"."email_template" AS ar
         SET "subject_template" = en."subject_template",
             "html_body" = en."html_body",
             "text_body" = en."text_body",
             "updated_at" = now()
        FROM "email"."email_template" AS en
       WHERE ar."template_key" = en."template_key"
         AND ar."locale" = 'ar'
         AND en."locale" = 'en'
    `);
  }
}
