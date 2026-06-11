import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { Submission } from '../entities/submission.entity';
import { User } from '../entities/user.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SearchService } from './search.service';

const BOOTSTRAP_BATCH = 100;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class SearchSyncService implements OnModuleInit {
  private readonly logger = new Logger(SearchSyncService.name);
  private lastSyncedAt: Date = new Date(0);

  constructor(
    private readonly searchService: SearchService,
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.searchService.isEnabled()) return;
    await this.searchService.ensureCollection();
    void this.bootstrap();
  }

  @Interval(SYNC_INTERVAL_MS)
  async catchUpSync(): Promise<void> {
    if (!this.searchService.isEnabled()) return;
    const since = this.lastSyncedAt;
    const submissions = await this.submissionsRepo.find({
      where: { status: SubmissionStatus.PUBLISHED },
      order: { publishedAt: 'ASC' },
    });
    const recent = submissions.filter(
      (s) => s.updatedAt && s.updatedAt > since,
    );
    if (recent.length === 0) return;
    await this.indexBatch(recent);
    this.lastSyncedAt = new Date();
    this.logger.log(`catch-up sync indexed ${recent.length} submission(s)`);
  }

  private async bootstrap(): Promise<void> {
    try {
      const submissions = await this.submissionsRepo.find({
        where: { status: SubmissionStatus.PUBLISHED },
        order: { publishedAt: 'ASC' },
      });
      let indexed = 0;
      for (let i = 0; i < submissions.length; i += BOOTSTRAP_BATCH) {
        const batch = submissions.slice(i, i + BOOTSTRAP_BATCH);
        await this.indexBatch(batch);
        indexed += batch.length;
      }
      this.lastSyncedAt = new Date();
      this.logger.log(
        `bootstrapped ${indexed} published document(s) into Typesense`,
      );
    } catch (err) {
      this.logger.error(
        `Typesense bootstrap failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async indexBatch(submissions: Submission[]): Promise<void> {
    const authorIds = [...new Set(submissions.map((s) => s.authorId))];
    const authors = await this.usersRepo.findBy(
      authorIds.map((id) => ({ id })),
    );
    const authorMap = new Map(authors.map((a) => [a.id, a.displayName ?? '']));
    for (const sub of submissions) {
      await this.searchService.upsertDocument(
        sub,
        authorMap.get(sub.authorId) ?? '',
      );
    }
  }
}
