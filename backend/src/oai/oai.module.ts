import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Journal } from '../entities/journal.entity';
import { Submission } from '../entities/submission.entity';
import { OaiPmhController } from './oai-pmh.controller';
import { OaiPmhService } from './oai-pmh.service';

/**
 * OAI-PMH harvesting interface. Reads published and retracted articles
 * directly rather than through the catalog service, because the archive view
 * deliberately includes retractions as tombstones — see `OaiPmhService`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Submission, Journal])],
  controllers: [OaiPmhController],
  providers: [OaiPmhService],
})
export class OaiModule {}
