import { Controller, Get, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { ManuscriptStyleCatalogResponseDto } from './manuscript-style.types';
import { ManuscriptStyleRegistryService } from './manuscript-style-registry.service';

@ApiTags('public')
@Controller('public/manuscript-styles')
@Throttle({ public: {} })
export class ManuscriptStylesCatalogController {
  constructor(private readonly registry: ManuscriptStyleRegistryService) {}

  /**
   * `defaultStyleId` depends on deployment env — avoid CDN/proxy indefinite caching.
   */
  @Get()
  @Header('Cache-Control', 'no-store')
  catalog(): ManuscriptStyleCatalogResponseDto {
    return this.registry.getCatalog();
  }
}
