import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchService } from './search.service';
import { SearchSyncService } from './search-sync.service';
import { SearchCurationController } from './search-curation.controller';
import { TYPESENSE_CLIENT, createTypesenseClient } from './typesense.client';
import { Submission } from '../entities/submission.entity';
import { User } from '../entities/user.entity';
import { RbacModule } from '../rbac/rbac.module';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Global()
@Module({
  imports: [
    ConfigModule,
    RbacModule,
    TypeOrmModule.forFeature([Submission, User]),
  ],
  controllers: [SearchCurationController],
  providers: [
    {
      provide: TYPESENSE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createTypesenseClient(config),
    },
    {
      provide: 'TYPESENSE_COLLECTION_NAME',
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('TYPESENSE_COLLECTION', 'publications'),
    },
    SearchService,
    SearchSyncService,
    PermissionsGuard,
  ],
  exports: [SearchService],
})
export class SearchModule {}
