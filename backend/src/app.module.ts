import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { PublicModule } from './public/public.module';
import { RbacModule } from './rbac/rbac.module';
import { MessagingModule } from './messaging/messaging.module';
import { AdminEmailModule } from './admin-email/admin-email.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CsrfGuard } from './common/guards/csrf.guard';
import { FolioThrottlerGuard } from './common/guards/folio-throttler.guard';
import { buildThrottlerModuleOptions } from './common/throttle-module.factory';
import { CommonGuardsModule } from './common/common-guards.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildThrottlerModuleOptions(config),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: parseInt(config.get<string>('DB_PORT', '5432'), 10),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_DATABASE', 'folio_review'),
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    ScheduleModule.forRoot(),
    CommonGuardsModule,
    HealthModule,
    RbacModule,
    UsersModule,
    AuthModule,
    MessagingModule,
    SubmissionsModule,
    PublicModule,
    AdminEmailModule,
    NotificationsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useExisting: FolioThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule {}
