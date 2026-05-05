import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EMAIL_PROVIDER_TOKEN } from './email-provider';
import { NoopEmailProvider } from './noop.provider';
import { SmtpEmailProvider } from './smtp.provider';

/**
 * Wires a single provider implementation behind EMAIL_PROVIDER_TOKEN.
 * Choice is driven by EMAIL_PROVIDER env var; default is `noop` so a
 * fresh checkout never accidentally tries to connect to an SMTP host.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    NoopEmailProvider,
    SmtpEmailProvider,
    {
      provide: EMAIL_PROVIDER_TOKEN,
      inject: [ConfigService, NoopEmailProvider, SmtpEmailProvider],
      useFactory: (
        config: ConfigService,
        noop: NoopEmailProvider,
        smtp: SmtpEmailProvider,
      ) => {
        const choice = (
          config.get<string>('EMAIL_PROVIDER', 'noop') ?? 'noop'
        ).toLowerCase();
        if (choice === 'smtp') return smtp;
        return noop;
      },
    },
  ],
  exports: [EMAIL_PROVIDER_TOKEN],
})
export class ProvidersModule {}
