import { Injectable } from '@nestjs/common';
import { EmailServiceClient } from '../email-client/email-client.service';
import type {
  EmailTemplateView,
  ReminderPolicyView,
  RenderedTemplateView,
} from '../email-client/email-client.types';

export type { EmailTemplateView, ReminderPolicyView, RenderedTemplateView };

@Injectable()
export class AdminEmailService {
  constructor(private readonly emailClient: EmailServiceClient) {}

  async getReminderPolicy(): Promise<ReminderPolicyView> {
    return this.emailClient.getReminderPolicy();
  }

  async patchReminderPolicy(
    reviewDueInDays: number,
    expectedUpdatedAt: string,
  ): Promise<ReminderPolicyView> {
    return this.emailClient.patchReminderPolicy(
      reviewDueInDays,
      expectedUpdatedAt,
    );
  }

  async getTemplate(
    templateKey: string,
    localeRaw?: string,
  ): Promise<EmailTemplateView> {
    return this.emailClient.getTemplate(templateKey, localeRaw);
  }

  async patchTemplate(
    templateKey: string,
    localeRaw: string | undefined,
    subjectTemplate: string,
    htmlBody: string,
    textBody: string,
    expectedUpdatedAt: string,
  ): Promise<EmailTemplateView> {
    return this.emailClient.patchTemplate(
      templateKey,
      localeRaw,
      subjectTemplate,
      htmlBody,
      textBody,
      expectedUpdatedAt,
    );
  }

  async previewTemplate(
    templateKey: string,
    isOverdue: boolean | undefined,
    localeRaw?: string,
  ): Promise<RenderedTemplateView> {
    return this.emailClient.previewTemplate(templateKey, isOverdue, localeRaw);
  }
}
