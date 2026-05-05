/**
 * Pluggable transport for outbound mail. The handler talks to this
 * interface only — never to a concrete provider — so we can swap
 * Nodemailer/Resend/Mailgun/etc. without touching the state machine.
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
};

export type SendEmailResult = {
  messageId: string | null;
};

export const EMAIL_PROVIDER_TOKEN = Symbol('EMAIL_PROVIDER');

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
