import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Journal } from '../entities/journal.entity';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';

/** Records returned per response before a resumptionToken is issued. */
export const OAI_PAGE_SIZE = 100;

/**
 * Config the endpoint cannot honestly invent.
 *
 * The OAI *identifier* of a record (`oai:<domain>:<slug>`) is permanent: change
 * the domain later and every harvester treats the whole archive as a new set of
 * records, orphaning what it already indexed. `adminEmail` is a real contact
 * obligation on a scholarly repository. Neither may be defaulted, so the
 * endpoint stays inert until both are supplied — see docs/EXTERNAL-ACTIONS.md
 * A3 and A7.
 */
export type OaiConfig = {
  siteUrl: string;
  repositoryDomain: string;
  repositoryName: string;
  adminEmail: string;
  publisher: string;
  /** Omitted entirely until a licence is approved (EXTERNAL-ACTIONS B1). */
  rights: string | null;
};

export type OaiConfigProblem = { missing: string[] };

export type OaiListFilters = {
  from?: Date | null;
  until?: Date | null;
  set?: string | null;
};

export type OaiItem = {
  submission: Submission;
  /** Retracted after publication — emitted as an OAI `status="deleted"` header. */
  deleted: boolean;
};

/**
 * The record source behind the OAI-PMH endpoint.
 *
 * Two statuses are in scope, not one. `published` articles are the archive;
 * `retracted` ones are tombstones. A retraction is terminal and reachable only
 * from `published`, so the row keeps its slug, journal, issue and publication
 * date — everything an OAI deleted-record header needs. Omitting them would
 * leave DOAJ and BASE serving a retracted paper indefinitely, because a
 * harvester that is never told about a deletion never performs one.
 */
@Injectable()
export class OaiPmhService {
  constructor(
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(Journal)
    private readonly journalsRepo: Repository<Journal>,
    private readonly config: ConfigService,
  ) {}

  /** Resolved config, or the list of setting names that are still missing. */
  resolveConfig(): OaiConfig | OaiConfigProblem {
    const missing: string[] = [];

    const siteUrl = (this.config.get<string>('PUBLIC_SITE_URL') ?? '')
      .trim()
      .replace(/\/+$/, '');
    if (siteUrl === '') missing.push('PUBLIC_SITE_URL');

    const adminEmail = (
      this.config.get<string>('OAI_ADMIN_EMAIL') ?? ''
    ).trim();
    if (adminEmail === '') missing.push('OAI_ADMIN_EMAIL');

    if (missing.length > 0) return { missing };

    let host = '';
    try {
      // hostname, not host: an OAI namespace identifier must be a domain
      // name, and a :port would make every record identifier spec-invalid.
      host = new URL(siteUrl).hostname;
    } catch {
      return { missing: ['PUBLIC_SITE_URL (not a valid absolute URL)'] };
    }

    const rights = (
      this.config.get<string>('OAI_RIGHTS_STATEMENT') ?? ''
    ).trim();

    return {
      siteUrl,
      repositoryDomain: (
        this.config.get<string>('OAI_REPOSITORY_IDENTIFIER') ?? host
      ).trim(),
      repositoryName: (
        this.config.get<string>('OAI_REPOSITORY_NAME') ??
        'Damascus University Journals'
      ).trim(),
      adminEmail,
      publisher: (
        this.config.get<string>('OAI_PUBLISHER_NAME') ?? 'Damascus University'
      ).trim(),
      rights: rights === '' ? null : rights,
    };
  }

  /** `oai:journals.example.edu:some-article-slug` */
  identifierFor(cfg: OaiConfig, slug: string): string {
    return `oai:${cfg.repositoryDomain}:${slug}`;
  }

  /** The local slug of an OAI identifier, or null if it is not ours. */
  slugFromIdentifier(cfg: OaiConfig, identifier: string): string | null {
    const prefix = `oai:${cfg.repositoryDomain}:`;
    if (!identifier.startsWith(prefix)) return null;
    const slug = identifier.slice(prefix.length);
    return slug === '' ? null : slug;
  }

  /** Public URL of the article page, in the default locale. */
  articleUrl(cfg: OaiConfig, slug: string): string {
    return `${cfg.siteUrl}/en/publications/${encodeURIComponent(slug)}`;
  }

  journalUrl(cfg: OaiConfig, journalSlug: string): string {
    return `${cfg.siteUrl}/en/journals/${encodeURIComponent(journalSlug)}`;
  }

  /**
   * The OAI datestamp of a record: when its *metadata* last changed, which is
   * `updatedAt`, not `publishedAt`. Incremental harvesters re-fetch on this
   * value, so a corrected abstract or a retraction has to move it forward.
   */
  datestampOf(s: Submission): Date {
    return s.updatedAt ?? s.publishedAt ?? new Date();
  }

  async listSets(): Promise<Journal[]> {
    return this.journalsRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }

  async earliestDatestamp(): Promise<Date> {
    const row = await this.submissionsRepo.findOne({
      where: this.baseWhere(),
      order: { updatedAt: 'ASC' },
    });
    return row ? this.datestampOf(row) : new Date();
  }

  /**
   * One page of records. Ordered by `updatedAt` then `id` so the sequence is
   * total and stable — an offset-based resumptionToken silently skips or
   * repeats rows if two records can tie with no tiebreaker.
   */
  async listItems(
    filters: OaiListFilters,
    offset: number,
    limit = OAI_PAGE_SIZE,
  ): Promise<{ items: OaiItem[]; total: number }> {
    const qb = this.submissionsRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.author', 'author')
      .leftJoinAndSelect('s.journal', 'journal')
      .leftJoinAndSelect('s.issue', 'issue')
      .where('s.status IN (:...oaiStatuses)', {
        oaiStatuses: [SubmissionStatus.PUBLISHED, SubmissionStatus.RETRACTED],
      })
      .andWhere('s.slug IS NOT NULL')
      .andWhere('s.publishedAt IS NOT NULL');

    if (filters.set) {
      qb.andWhere('journal.slug = :oaiSet', { oaiSet: filters.set });
    }
    if (filters.from) {
      qb.andWhere('s.updatedAt >= :oaiFrom', { oaiFrom: filters.from });
    }
    if (filters.until) {
      qb.andWhere('s.updatedAt <= :oaiUntil', { oaiUntil: filters.until });
    }

    qb.orderBy('s.updatedAt', 'ASC').addOrderBy('s.id', 'ASC');

    const total = await qb.getCount();
    const rows = await qb.skip(offset).take(limit).getMany();

    return {
      items: rows.map((s) => ({
        submission: s,
        deleted: s.status === SubmissionStatus.RETRACTED,
      })),
      total,
    };
  }

  /** One record by slug, including a retracted one so GetRecord can tombstone it. */
  async findItem(slug: string): Promise<OaiItem | null> {
    const s = await this.submissionsRepo.findOne({
      where: {
        slug,
        status: In([SubmissionStatus.PUBLISHED, SubmissionStatus.RETRACTED]),
        publishedAt: Not(IsNull()),
      },
      relations: ['author', 'journal', 'issue'],
    });
    if (!s) return null;
    return { submission: s, deleted: s.status === SubmissionStatus.RETRACTED };
  }

  async setExists(slug: string): Promise<boolean> {
    const n = await this.journalsRepo.count({
      where: { slug, isActive: true },
    });
    return n > 0;
  }

  private baseWhere() {
    return {
      status: In([SubmissionStatus.PUBLISHED, SubmissionStatus.RETRACTED]),
      slug: Not(IsNull()),
      publishedAt: Not(IsNull()),
    };
  }
}
