import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditLogService } from './audit-log.service';
import { AuditMiddleware } from './audit.middleware';

@Module({
  providers: [AuditLogService],
  controllers: [AuditController],
  exports: [AuditLogService],
})
export class AuditModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuditMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
