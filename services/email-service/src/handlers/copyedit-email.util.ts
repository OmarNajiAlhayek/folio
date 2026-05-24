import { Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { EmailLog } from '../email-log/email-log.entity';
import { TemplatesService } from '../templates/templates.service';
import { EmailProvider } from '../providers/email-provider';
import { normalizeEmailLocale } from '../common/email-locale';
import { ACK, HandlerOutcome } from './handler-result';

export type CopyeditMailDeps = {
  dataSource: DataSource;
  provider: EmailProvider;
  templates: TemplatesService;
  logger: Logger;
};

export async function preclaimCopyeditEmail(
  manager: EntityManager,
  idempotencyKey: string,
  recipient: string,
  template: string,
  context: Record<string, unknown>,
): Promise<EmailLog> {
  const logRepo = manager.getRepository(EmailLog);
  const insertResult = (await logRepo.query(
    `INSERT INTO "email"."email_log"
       ("idempotency_key", "recipient", "template", "context", "status"
     ) VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT ("idempotency_key") DO NOTHING
     RETURNING "id"`,
    [idempotencyKey, recipient, template, JSON.stringify(context), 'pending'],
  )) as Array<{ id: string }>;
  const insertedId = insertResult[0]?.id;
  if (!insertedId) {
    const existing = await logRepo.findOne({
      where: { idempotencyKey },
    });
    if (!existing) {
      throw new Error('pre-claim conflict but row not found');
    }
    return existing;
  }
  const fresh = await logRepo.findOne({ where: { id: insertedId } });
  if (!fresh) {
    throw new Error('pre-claim row vanished after insert');
  }
  return fresh;
}

export async function renderAndSendCopyeditEmail(
  deps: CopyeditMailDeps,
  row: EmailLog,
  args: {
    idempotencyKey: string;
    recipient: string;
    template: string;
    emailLocale?: 'en' | 'ar';
    templateVars: Record<string, unknown>;
  },
): Promise<HandlerOutcome> {
  const logRepo = deps.dataSource.getRepository(EmailLog);
  const emailLocale = normalizeEmailLocale(args.emailLocale);
  const rendered = await deps.templates.render(
    args.template,
    emailLocale,
    args.templateVars,
  );
  try {
    const result = await deps.provider.send({
      to: args.recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    const updated = await logRepo
      .createQueryBuilder()
      .update(EmailLog)
      .set({
        status: 'sent',
        providerMessageId: result.messageId,
        sentAt: new Date(),
        error: null,
      })
      .where('id = :id AND status IN (:...allowed)', {
        id: row.id,
        allowed: ['pending', 'failed'],
      })
      .execute();
    if (!updated.affected) {
      deps.logger.warn(
        `copyedit send race lost id=${row.id} template=${args.template}`,
      );
    }
    return ACK;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logRepo.update(row.id, { status: 'failed', error: message });
    throw err;
  }
}
