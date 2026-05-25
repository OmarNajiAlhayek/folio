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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const ttl = parseInt(config.get<string>('THROTTLE_TTL_MS', '60000'), 10);
        return [
          {
            name: 'login',
            ttl,
            limit: parseInt(
              config.get<string>('THROTTLE_LOGIN_LIMIT', '10'),
              10,
            ),
          },
          {
            name: 'register',
            ttl,
            limit: parseInt(
              config.get<string>('THROTTLE_REGISTER_LIMIT', '5'),
              10,
            ),
          },
        ];
      },
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
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule {}
