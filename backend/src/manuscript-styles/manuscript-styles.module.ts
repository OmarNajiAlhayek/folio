import { Module } from '@nestjs/common';
import { ManuscriptStyleRegistryService } from './manuscript-style-registry.service';
import { ManuscriptStylesCatalogController } from './manuscript-styles-catalog.controller';

@Module({
  controllers: [ManuscriptStylesCatalogController],
  providers: [ManuscriptStyleRegistryService],
  exports: [ManuscriptStyleRegistryService],
})
export class ManuscriptStylesModule {}
