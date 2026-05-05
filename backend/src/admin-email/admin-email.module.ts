import { Module } from '@nestjs/common';
import { AdminEmailController } from './admin-email.controller';
import { AdminEmailService } from './admin-email.service';

@Module({
  controllers: [AdminEmailController],
  providers: [AdminEmailService],
  exports: [AdminEmailService],
})
export class AdminEmailModule {}
