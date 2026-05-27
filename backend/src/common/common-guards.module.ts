import { Global, Module } from '@nestjs/common';
import { FolioThrottlerGuard } from './guards/folio-throttler.guard';

/** Makes `FolioThrottlerGuard` injectable for method-level `@UseGuards`. */
@Global()
@Module({
  providers: [FolioThrottlerGuard],
  exports: [FolioThrottlerGuard],
})
export class CommonGuardsModule {}
