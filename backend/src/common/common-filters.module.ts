import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ClsModule, ClsService } from 'nestjs-cls';
import { folioLoggerUseFactory } from '@folio/nest-observability';
import { ApiExceptionFilter } from './filters/api-exception.filter';

/** Global Pino logging and exception filter in one module scope. */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule, ClsModule],
      inject: [ConfigService, ClsService],
      useFactory: folioLoggerUseFactory('folio-backend'),
    }),
  ],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
  exports: [LoggerModule],
})
export class CommonFiltersModule {}
