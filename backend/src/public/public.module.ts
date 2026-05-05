import { Module } from '@nestjs/common';
import { PublicSubmissionsController } from './public-submissions.controller';
import { SubmissionsModule } from '../submissions/submissions.module';

@Module({
  imports: [SubmissionsModule],
  controllers: [PublicSubmissionsController],
})
export class PublicModule {}
