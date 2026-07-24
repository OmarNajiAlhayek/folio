import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalSetting } from '../entities/journal-settings.entity';

@Injectable()
export class JournalSettingsService {
  constructor(
    @InjectRepository(JournalSetting)
    private readonly repo: Repository<JournalSetting>,
  ) {}

  async getReviewerGuidelines(): Promise<string> {
    const row = await this.repo.findOne({
      where: { key: 'reviewer_guidelines' },
    });
    return row?.value ?? '';
  }

  async setReviewerGuidelines(text: string): Promise<void> {
    await this.repo.upsert(
      { key: 'reviewer_guidelines', value: text },
      { conflictPaths: ['key'] },
    );
  }
}
