import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  EmailPipelineSlice,
  EmailTemplateView,
  ReminderAdminDto,
  ReminderPolicyView,
  RenderedTemplateView,
} from './email-client.types';

type ApiErrorBody = {
  message?: string | { message?: string; code?: string };
  code?: string;
};

@Injectable()
export class EmailServiceClient {
  private readonly logger = new Logger(EmailServiceClient.name);

  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    return this.config
      .get<string>('EMAIL_SERVICE_URL', 'http://127.0.0.1:5244')
      .replace(/\/$/, '');
  }

  private serviceToken(): string {
    return this.config.get<string>('EMAIL_SERVICE_TOKEN', '').trim();
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    const token = this.serviceToken();
    if (token) {
      headers['x-folio-service-token'] = token;
    }
    return headers;
  }

  private throwMapped(status: number, body: ApiErrorBody): never {
    const nested =
      typeof body.message === 'object' && body.message !== null
        ? body.message
        : body;
    const message =
      (typeof nested.message === 'string' ? nested.message : undefined) ??
      (typeof body.message === 'string' ? body.message : undefined) ??
      `email-service request failed (${status})`;
    const code =
      (typeof nested.code === 'string' ? nested.code : undefined) ??
      (typeof body.code === 'string' ? body.code : undefined);

    const payload = { message, ...(code ? { code } : {}) };

    switch (status) {
      case 400:
      case 422:
        throw new UnprocessableEntityException(payload);
      case 401:
        throw new UnauthorizedException(payload);
      case 403:
        throw new ForbiddenException(payload);
      case 404:
        throw new NotFoundException(payload);
      case 409:
        throw new ConflictException(payload);
      case 503:
        throw new ServiceUnavailableException(payload);
      default:
        if (status >= 500) {
          throw new InternalServerErrorException(payload);
        }
        throw new UnprocessableEntityException(payload);
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl()}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`email-service unreachable: ${msg}`);
      throw new ServiceUnavailableException({
        message: 'Email service is unavailable',
        code: 'EMAIL_SERVICE_UNAVAILABLE',
      });
    }

    if (!res.ok) {
      let parsed: ApiErrorBody = {};
      try {
        parsed = (await res.json()) as ApiErrorBody;
      } catch {
        parsed = {};
      }
      this.throwMapped(res.status, parsed);
    }

    if (res.status === 204) {
      return undefined as T;
    }
    return (await res.json()) as T;
  }

  getReminderPolicy(): Promise<ReminderPolicyView> {
    return this.request('GET', '/internal/reminder-policy');
  }

  patchReminderPolicy(
    reviewDueInDays: number,
    expectedUpdatedAt: string,
  ): Promise<ReminderPolicyView> {
    return this.request('PATCH', '/internal/reminder-policy', {
      reviewDueInDays,
      expectedUpdatedAt,
    });
  }

  getTemplate(
    templateKey: string,
    locale?: string,
  ): Promise<EmailTemplateView> {
    const q = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return this.request('GET', `/internal/templates/${templateKey}${q}`);
  }

  patchTemplate(
    templateKey: string,
    locale: string | undefined,
    subjectTemplate: string,
    htmlBody: string,
    textBody: string,
    expectedUpdatedAt: string,
  ): Promise<EmailTemplateView> {
    const q = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return this.request('PATCH', `/internal/templates/${templateKey}${q}`, {
      subjectTemplate,
      htmlBody,
      textBody,
      expectedUpdatedAt,
    });
  }

  previewTemplate(
    templateKey: string,
    isOverdue: boolean | undefined,
    locale?: string,
  ): Promise<RenderedTemplateView> {
    const q = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return this.request(
      'POST',
      `/internal/templates/${templateKey}/preview${q}`,
      { isOverdue },
    );
  }

  getPipelineSlice(): Promise<EmailPipelineSlice> {
    return this.request('GET', '/internal/pipeline-status');
  }

  listReminders(assignmentSlug: string): Promise<ReminderAdminDto[]> {
    const q = `?assignmentSlug=${encodeURIComponent(assignmentSlug)}`;
    return this.request('GET', `/internal/reminders${q}`);
  }

  listRemindersForAssignments(
    assignmentSlugs: string[],
  ): Promise<ReminderAdminDto[]> {
    if (assignmentSlugs.length === 0) return Promise.resolve([]);
    const q = `?assignmentSlugs=${encodeURIComponent(assignmentSlugs.join(','))}`;
    return this.request('GET', `/internal/reminders${q}`);
  }

  getReminder(
    reminderId: string,
    assignmentSlug: string,
  ): Promise<ReminderAdminDto> {
    const q = `?assignmentSlug=${encodeURIComponent(assignmentSlug)}`;
    return this.request('GET', `/internal/reminders/${reminderId}${q}`);
  }

  patchReminderSendAt(
    reminderId: string,
    assignmentSlug: string,
    sendAt: string,
  ): Promise<ReminderAdminDto> {
    const q = `?assignmentSlug=${encodeURIComponent(assignmentSlug)}`;
    return this.request('PATCH', `/internal/reminders/${reminderId}${q}`, {
      sendAt,
    });
  }

  cancelReminder(
    reminderId: string,
    assignmentSlug: string,
  ): Promise<ReminderAdminDto> {
    const q = `?assignmentSlug=${encodeURIComponent(assignmentSlug)}`;
    return this.request('POST', `/internal/reminders/${reminderId}/cancel${q}`);
  }
}
