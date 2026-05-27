import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  EmailProvider,
  SendEmailInput,
  SendEmailResult,
} from './email-provider';

type Transporter = ReturnType<typeof nodemailer.createTransport>;

/**
 * Skeleton SMTP provider. Real credentials/config come later — the
 * "decide vendor later" answer in the plan. This file exists so
 * EMAIL_PROVIDER=smtp doesn't crash; once SMTP_HOST etc. are set
 * and a vendor is picked, this is the spot.
 */
@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  private readonly logger = new Logger(SmtpEmailProvider.name);
  private readonly transporter: Transporter | null;
  private readonly defaultFrom: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const port = parseInt(config.get<string>('SMTP_PORT', '587'), 10);
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    const secureEnv = config.get<string>('SMTP_SECURE', '').trim().toLowerCase();
    const secure =
      secureEnv === 'true' || secureEnv === '1' || port === 465;
    this.defaultFrom = config.get<string>('EMAIL_FROM', 'no-reply@folio.local');

    if (!host) {
      this.logger.warn(
        'SMTP_HOST not set; SmtpEmailProvider will refuse to send. Use EMAIL_PROVIDER=noop in dev.',
      );
      this.transporter = null;
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    if (!this.transporter) {
      throw new Error('SMTP not configured (SMTP_HOST missing)');
    }
    const result = await this.transporter.sendMail({
      from: input.from ?? this.defaultFrom,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { messageId: result.messageId ?? null };
  }
}
