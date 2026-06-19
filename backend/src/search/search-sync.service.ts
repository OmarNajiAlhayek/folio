import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, MoreThan, Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { Submission } from '../entities/submission.entity';
import { User } from '../entities/user.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SearchService } from './search.service';
import { SearchSyncCheckpoint } from './search-sync-checkpoint.entity';

const BOOTSTRAP_BATCH = 100;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const CHECKPOINT_ID = 1;
const UPSERT_CONCURRENCY = 10;

@Injectable()
export class SearchSyncService implements OnModuleInit {
  private readonly logger = new Logger(SearchSyncService.name);
  private lastSyncedAt: Date = new Date(0);
  private reindexInProgress = false;

  constructor(
    private readonly searchService: SearchService,
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(SearchSyncCheckpoint)
    private readonly checkpointRepo: Repository<SearchSyncCheckpoint>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.searchService.isEnabled()) return;
    await this.searchService.ensureCollection();
    await this.searchService.ensureAnalyticsRules();

    const checkpoint = await this.checkpointRepo.findOne({
      where: { id: CHECKPOINT_ID },
    });
    if (checkpoint) {
      this.lastSyncedAt = checkpoint.lastSyncedAt;
      this.logger.log(
        `Restored sync checkpoint: last synced at ${checkpoint.lastSyncedAt.toISOString()}`,
      );
    }

    void this.bootstrap();
  }

  isReindexInProgress(): boolean {
    return this.reindexInProgress;
  }

  @Interval(SYNC_INTERVAL_MS)
  async catchUpSync(): Promise<void> {
    if (!this.searchService.isEnabled()) return;
    try {
      // Capture the window start before any queries so submissions updated
      // during this run are picked up by the next cycle, not silently skipped.
      const queryStart = new Date();
      const since = this.lastSyncedAt;

      const recent = await this.submissionsRepo.find({
        where: {
          status: SubmissionStatus.PUBLISHED,
          updatedAt: MoreThan(since),
        },
        order: { publishedAt: 'ASC' },
      });
      if (recent.length > 0) {
        await this.indexBatch(recent);
        this.logger.log(`catch-up sync indexed ${recent.length} submission(s)`);
      }

      const unpublished = await this.submissionsRepo.find({
        where: {
          status: Not(SubmissionStatus.PUBLISHED),
          updatedAt: MoreThan(since),
        },
        select: ['id'],
      });
      for (let i = 0; i < unpublished.length; i += UPSERT_CONCURRENCY) {
        const chunk = unpublished.slice(i, i + UPSERT_CONCURRENCY);
        await Promise.all(
          chunk.map((sub) => this.searchService.deleteDocument(sub.id)),
        );
      }
      if (unpublished.length > 0) {
        this.logger.log(
          `catch-up sync pruned ${unpublished.length} non-published document(s)`,
        );
      }

      await this.saveCheckpoint(queryStart);
    } catch (err) {
      this.logger.error(
        `Catch-up sync failed — checkpoint NOT advanced: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Full reindex: drop the collection, recreate it, and re-bootstrap from DB. */
  async reindex(): Promise<void> {
    if (!this.searchService.isEnabled()) return;
    if (this.reindexInProgress) return;
    this.reindexInProgress = true;
    try {
      this.logger.log('Reindex triggered — dropping and rebuilding collection');
      await this.searchService.dropCollection();
      await this.searchService.ensureCollection();
      await this.searchService.ensureAnalyticsRules();
      this.lastSyncedAt = new Date(0);
      await this.saveCheckpoint(this.lastSyncedAt);
      await this.bootstrap();
    } finally {
      this.reindexInProgress = false;
    }
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
      await this.saveCheckpoint(new Date());
      this.logger.log(
        `bootstrapped ${indexed} published document(s) into Typesense`,
      );
    } catch (err) {
      this.logger.error(
        `Typesense bootstrap failed — checkpoint NOT advanced: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async saveCheckpoint(date: Date): Promise<void> {
    this.lastSyncedAt = date;
    try {
      await this.checkpointRepo.save({ id: CHECKPOINT_ID, lastSyncedAt: date });
    } catch (err) {
      this.logger.warn(`Failed to persist sync checkpoint: ${String(err)}`);
    }
  }

  private async indexBatch(submissions: Submission[]): Promise<void> {
    const authorIds = [...new Set(submissions.map((s) => s.authorId))];
    const authors = await this.usersRepo.findBy(
      authorIds.map((id) => ({ id })),
    );
    const authorMap = new Map(authors.map((a) => [a.id, a.displayName ?? '']));

    for (let i = 0; i < submissions.length; i += UPSERT_CONCURRENCY) {
      const chunk = submissions.slice(i, i + UPSERT_CONCURRENCY);
      await Promise.all(
        chunk.map((sub) =>
          this.searchService.upsertDocument(
            sub,
            authorMap.get(sub.authorId) ?? '',
          ),
        ),
      );
    }
  }
}
