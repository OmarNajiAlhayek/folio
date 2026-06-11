import { Global, Module } from '@nestjs/common';
import { EmailServiceClient } from './email-client.service';

@Global()
@Module({
  providers: [EmailServiceClient],
  exports: [EmailServiceClient],
})
export class EmailClientModule {}
