import { Injectable, Logger } from '@nestjs/common';
import { EmailProvider, SendEmailInput, SendEmailResult } from './email-provider';

/**
 * Default in-development provider. Logs the recipient + subject and
 * pretends a delivery succeeded. Activated by EMAIL_PROVIDER=noop (or
 * when no provider is configured) so contributors never need an SMTP
 * server to run the service locally.
 */
@Injectable()
export class NoopEmailProvider implements EmailProvider {
  private readonly logger = new Logger(NoopEmailProvider.name);

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    this.logger.log(`[noop] would send to=${input.to} subject="${input.subject}"`);
    return { messageId: `noop-${Date.now()}` };
  }
}
