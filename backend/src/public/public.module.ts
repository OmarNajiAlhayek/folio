import { Module } from '@nestjs/common';
import { PublicSubmissionsController } from './public-submissions.controller';
import { PublicJournalsController } from './public-journals.controller';
import { SubmissionsModule } from '../submissions/submissions.module';
import { JournalsModule } from '../journals/journals.module';

@Module({
  imports: [SubmissionsModule, JournalsModule],
  controllers: [PublicSubmissionsController, PublicJournalsController],
})
export class PublicModule {}
