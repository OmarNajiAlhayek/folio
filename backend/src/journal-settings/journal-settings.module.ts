import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalSetting } from '../entities/journal-settings.entity';
import { JournalSettingsService } from './journal-settings.service';
import { JournalSettingsController } from './journal-settings.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([JournalSetting]), RbacModule],
  controllers: [JournalSettingsController],
  providers: [JournalSettingsService],
  exports: [JournalSettingsService],
})
export class JournalSettingsModule {}
