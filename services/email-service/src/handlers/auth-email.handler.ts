import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  AuthPasswordResetEvent,
  AuthRegistrationWelcomeEvent,
  AuthVerificationOtpEvent,
} from '@folio/shared/contracts/email-events';
import {
  authPasswordResetKey,
  authRegistrationWelcomeKey,
  authVerificationOtpKey,
} from '@folio/shared/messaging/idempotency';
import { redactEventPayload } from '@folio/shared/messaging/redactor';
import {
  EMAIL_PROVIDER_TOKEN,
  EmailProvider,
} from '../providers/email-provider';
import { TemplatesService } from '../templates/templates.service';
import { ACK, HandlerOutcome } from './handler-result';
import {
  CopyeditMailDeps,
  preclaimCopyeditEmail,
  renderAndSendCopyeditEmail,
} from './copyedit-email.util';

@Injectable()
export class AuthEmailHandler {
  private readonly logger = new Logger(AuthEmailHandler.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(EMAIL_PROVIDER_TOKEN) private readonly provider: EmailProvider,
    private readonly templates: TemplatesService,
  ) {}

  private deps(): CopyeditMailDeps {
    return {
      dataSource: this.dataSource,
      provider: this.provider,
      templates: this.templates,
      logger: this.logger,
    };
  }

  async handleVerificationOtp(
    event: AuthVerificationOtpEvent,
  ): Promise<HandlerOutcome> {
    if (event.idempotencyKey !== authVerificationOtpKey(event.challengeId)) {
      this.logger.warn(
        `idempotencyKey mismatch ${JSON.stringify(redactEventPayload(event))}`,
      );
      return { kind: 'nack-no-requeue', reason: 'bad idempotency key' };
    }
    return this.dispatch(event, {
      recipient: event.user.email,
      template: 'auth-verification-otp',
      templateVars: {
        displayName: event.user.displayName,
        otpCode: event.otpCode,
        verifyUrl: event.verifyUrl,
      },
    });
  }

  async handlePasswordReset(
    event: AuthPasswordResetEvent,
  ): Promise<HandlerOutcome> {
    if (event.idempotencyKey !== authPasswordResetKey(event.challengeId)) {
      this.logger.warn(
        `idempotencyKey mismatch ${JSON.stringify(redactEventPayload(event))}`,
      );
      return { kind: 'nack-no-requeue', reason: 'bad idempotency key' };
    }
    return this.dispatch(event, {
      recipient: event.user.email,
      template: 'auth-password-reset',
      templateVars: {
        displayName: event.user.displayName,
        resetUrl: event.resetUrl,
      },
    });
  }

  async handleRegistrationWelcome(
    event: AuthRegistrationWelcomeEvent,
  ): Promise<HandlerOutcome> {
    if (event.idempotencyKey !== authRegistrationWelcomeKey(event.userId)) {
      this.logger.warn(
        `idempotencyKey mismatch ${JSON.stringify(redactEventPayload(event))}`,
      );
      return { kind: 'nack-no-requeue', reason: 'bad idempotency key' };
    }
    return this.dispatch(event, {
      recipient: event.user.email,
      template: 'auth-registration-welcome',
      templateVars: {
        displayName: event.user.displayName,
        dashboardUrl: event.dashboardUrl,
        newSubmissionUrl: event.newSubmissionUrl,
        willingToReview: event.willingToReview,
      },
    });
  }

  private async dispatch(
    event: {
      idempotencyKey: string;
      emailLocale?: 'en' | 'ar';
    },
    args: {
      recipient: string;
      template: string;
      templateVars: Record<string, unknown>;
    },
  ): Promise<HandlerOutcome> {
    let row;
    try {
      row = await this.dataSource.transaction((manager) =>
        preclaimCopyeditEmail(
          manager,
          event.idempotencyKey,
          args.recipient,
          args.template,
          event as unknown as Record<string, unknown>,
        ),
      );
    } catch (err) {
      this.logger.error(
        `pre-claim failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }

    if (row.status === 'sent') {
      return ACK;
    }

    return renderAndSendCopyeditEmail(this.deps(), row, {
      idempotencyKey: event.idempotencyKey,
      recipient: args.recipient,
      template: args.template,
      emailLocale: event.emailLocale,
      templateVars: args.templateVars,
    });
  }
}
