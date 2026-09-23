import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Submission } from '../entities/submission.entity';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { AiClientService } from '../ai/ai-client.service';
import { AiJobsService } from '../ai-jobs/ai-jobs.service';
import { SearchService } from '../search/search.service';
import {
  applyPublicationCatalogQuery,
  clampPublicationCatalogPagination,
  PUBLICATION_ADVANCED_AUTHOR_MATCH_SQL,
  PUBLICATION_AUTHOR_SUGGESTION_DEFAULT_LIMIT,
  PUBLICATION_AUTHOR_SUGGESTION_MAX_LIMIT,
  PUBLICATION_AUTHOR_SUGGESTION_MIN_QUERY_LENGTH,
  PUBLICATION_AUTHOR_SUGGESTION_RANK_ALIAS,
  PUBLICATION_AUTHOR_SUGGESTION_RANK_SQL,
  PUBLICATION_SEARCH_AUTHOR_SIMILARITY_MIN,
  publicationCatalogHasTextOrFilters,
  publicationCatalogNeedsAuthorJoin,
  trimCatalogFilter,
  type PublicationCatalogFilters,
  type PublishedAuthorSuggestionRow,
} from './publication-catalog-search.util';
import { isSimilarityCorpusArticleId } from './publication-similarity.util';

export type PublicationListItem = {
  id: string;
  slug: string | null;
  title: string;
  titleAr: string | null;
  abstract: string;
  abstractAr: string | null;
  articleType: Submission['articleType'];
  keywords: string | null;
  keywordsAr: string | null;
  disciplines: string[] | null;
  /** Null only when the journal relation was not loaded for this query. */
  journal: { slug: string; titleAr: string; titleEn: string } | null;
  publishedAt: Date | null;
  author?: { displayName: string };
};

@Injectable()
export class PublicationCatalogService {
  private readonly logger = new Logger(PublicationCatalogService.name);

  constructor(
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    private readonly aiClient: AiClientService,
    private readonly aiJobs: AiJobsService,
    @Optional() private readonly searchService: SearchService | null = null,
  ) {}

  toPublicationListItem(s: Submission): PublicationListItem {
    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      titleAr: s.titleAr,
      abstract: s.abstract,
      abstractAr: s.abstractAr,
      articleType: s.articleType,
      keywords: s.keywords,
      keywordsAr: s.keywordsAr,
      disciplines: s.disciplines,
      journal: s.journal
        ? {
            slug: s.journal.slug,
            titleAr: s.journal.titleAr,
            titleEn: s.journal.titleEn,
          }
        : null,
      publishedAt: s.publishedAt,
      author: s.author
        ? {
            displayName: s.author.displayName,
          }
        : undefined,
    };
  }

  async findPublishedList(
    filters: PublicationCatalogFilters = {},
    pagination?: { limit?: number; offset?: number },
  ): Promise<{ items: Submission[]; total: number }> {
    if (this.searchService?.isEnabled()) {
      try {
        return await this.searchService.searchAsSubmissions(
          filters,
          pagination,
        );
      } catch (err) {
        this.logger.warn(
          `Typesense search failed, falling back to PostgreSQL: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const { limit, offset } = clampPublicationCatalogPagination(
      pagination?.limit,
      pagination?.offset,
    );
    const hasFilters = publicationCatalogHasTextOrFilters(filters);
    if (!hasFilters) {
      const [items, total] = await this.submissionsRepo.findAndCount({
        where: { status: SubmissionStatus.PUBLISHED },
        order: { publishedAt: 'DESC' },
        relations: ['author', 'journal'],
        take: limit,
        skip: offset,
      });
      return { items, total };
    }

    // Two builders rather than one. The count only needs the predicates, so
    // building it separately keeps the display joins out of the COUNT query —
    // and since no predicate touches `users` any more, it joins nothing at all.
    const countQb = this.submissionsRepo.createQueryBuilder('s');
    applyPublicationCatalogQuery(countQb, filters);

    const qb = this.submissionsRepo.createQueryBuilder('s');
    applyPublicationCatalogQuery(qb, filters);
    if (!publicationCatalogNeedsAuthorJoin()) {
      qb.leftJoinAndSelect('s.author', 'author');
    }
    // A journal filter already joined-and-selected the relation under the same
    // alias; joining twice would be valid SQL and pure waste.
    if (!filters.journal) {
      qb.leftJoinAndSelect('s.journal', 'journal');
    }

    // Concurrent: they are independent reads, so the request waits for the
    // slower of the two rather than their sum. Both were already outside a
    // transaction, so this changes no consistency guarantee.
    const [total, items] = await Promise.all([
      countQb.getCount(),
      qb.skip(offset).take(limit).getMany(),
    ]);
    return { items, total };
  }

  async findPublishedAuthorSuggestions(
    q: string,
    limit = PUBLICATION_AUTHOR_SUGGESTION_DEFAULT_LIMIT,
  ): Promise<PublishedAuthorSuggestionRow[]> {
    const trimmed = trimCatalogFilter(q);
    if (
      !trimmed ||
      trimmed.length < PUBLICATION_AUTHOR_SUGGESTION_MIN_QUERY_LENGTH
    ) {
      return [];
    }
    const lim = Math.min(
      PUBLICATION_AUTHOR_SUGGESTION_MAX_LIMIT,
      Math.max(1, limit),
    );
    const matchParams = {
      pubAuthor: trimmed,
      pubAuthorSimMin: PUBLICATION_SEARCH_AUTHOR_SIMILARITY_MIN,
    };

    const rows = await this.submissionsRepo
      .createQueryBuilder('s')
      .innerJoin('s.author', 'author')
      .select('author.displayName', 'displayName')
      .addSelect('COUNT(s.id)', 'publicationCount')
      .where('s.status = :pubStatus', { pubStatus: SubmissionStatus.PUBLISHED })
      .andWhere("COALESCE(author.display_name, '') <> ''")
      .andWhere(PUBLICATION_ADVANCED_AUTHOR_MATCH_SQL, matchParams)
      .groupBy('author.displayName')
      .addSelect(
        PUBLICATION_AUTHOR_SUGGESTION_RANK_SQL,
        PUBLICATION_AUTHOR_SUGGESTION_RANK_ALIAS,
      )
      .orderBy(PUBLICATION_AUTHOR_SUGGESTION_RANK_ALIAS, 'DESC')
      .addOrderBy('COUNT(s.id)', 'DESC')
      .setParameters(matchParams)
      .limit(lim)
      .getRawMany<{ displayName: string; publicationCount: string }>();

    return rows.map((row) => ({
      displayName: row.displayName,
      publicationCount: Number(row.publicationCount) || 0,
    }));
  }

  async findPublishedSemanticList(
    filters: PublicationCatalogFilters,
    limit = 20,
  ): Promise<
    (PublicationListItem & { searchSnippet: string; searchScore: number })[]
  > {
    const q = filters.q?.trim();
    if (!q || !this.aiClient.isSimilarityEnabled()) {
      return [];
    }
    void this.aiJobs.enqueueMissingSimilarityIndexJobs().catch((err) => {
      this.logger.warn(
        'Failed to enqueue missing similarity index jobs: %s',
        err instanceof Error ? err.message : String(err),
      );
    });
    const lim = Math.min(30, Math.max(1, limit));
    const hits = (
      await this.aiClient.semanticSearchPublications({ query: q, limit: lim })
    ).filter((h) => isSimilarityCorpusArticleId(h.article_id));
    if (hits.length === 0) {
      return [];
    }

    const ids = hits.map((h) => h.article_id);
    const { q: _searchQ, ...rest } = filters;
    void _searchQ;
    const filtersWithoutQ: PublicationCatalogFilters = rest;
    const qb = this.submissionsRepo.createQueryBuilder('s');
    applyPublicationCatalogQuery(qb, filtersWithoutQ, {
      skipQuickSearch: true,
    });
    qb.andWhere('s.id IN (:...semanticIds)', { semanticIds: ids });
    if (!publicationCatalogNeedsAuthorJoin()) {
      qb.leftJoinAndSelect('s.author', 'author');
    }
    const rows = await qb.getMany();
    const byId = new Map(rows.map((r) => [r.id, r]));
    const hitById = new Map(hits.map((h) => [h.article_id, h]));

    const ordered: (PublicationListItem & {
      searchSnippet: string;
      searchScore: number;
    })[] = [];
    for (const id of ids) {
      const row = byId.get(id);
      const hit = hitById.get(id);
      if (!row || !hit) {
        continue;
      }
      ordered.push({
        ...this.toPublicationListItem(row),
        searchSnippet: hit.snippet,
        searchScore: hit.score,
      });
    }
    return ordered;
  }

  async findPublishedOne(slug: string): Promise<Submission> {
    const s = await this.submissionsRepo.findOne({
      where: { slug, status: SubmissionStatus.PUBLISHED },
      relations: ['author', 'files', 'journal', 'issue'],
    });
    if (!s) {
      throw new NotFoundException({
        message: 'Publication not found',
        code: 'NOT_FOUND',
      });
    }
    return s;
  }

  async enqueuePublishedSubmissionForSimilarity(
    submissionId: string,
  ): Promise<void> {
    if (!this.aiClient.isSimilarityEnabled()) {
      return;
    }
    await this.aiJobs.enqueueSimilarityIndex(submissionId);
  }

  async enqueueMissingSimilarityIndexJobs(): Promise<number> {
    if (!this.aiClient.isSimilarityEnabled()) {
      return 0;
    }
    return this.aiJobs.enqueueMissingSimilarityIndexJobs();
  }

  async findRelatedPublications(
    slug: string,
    limit = 5,
  ): Promise<
    {
      id: string;
      slug: string;
      title: string;
      titleAr: string | null;
      abstract: string;
      abstractAr: string | null;
      similarity: number;
    }[]
  > {
    if (!this.aiClient.isSimilarityEnabled()) {
      return [];
    }
    void this.aiJobs.enqueueMissingSimilarityIndexJobs().catch((err) => {
      this.logger.warn(
        'Failed to enqueue missing similarity index jobs: %s',
        err instanceof Error ? err.message : String(err),
      );
    });
    const s = await this.findPublishedOne(slug);
    const hits = (
      await this.aiClient.findSimilarArticles({
        articleId: s.id,
        limit,
      })
    ).filter(
      (h) => isSimilarityCorpusArticleId(h.article_id) && h.article_id !== s.id,
    );
    if (hits.length === 0) {
      return [];
    }
    const ids = hits.map((h) => h.article_id);
    const related = await this.submissionsRepo.find({
      where: {
        id: In(ids),
        status: SubmissionStatus.PUBLISHED,
      },
    });
    const byId = new Map(related.map((r) => [r.id, r]));
    const rows: {
      id: string;
      slug: string;
      title: string;
      titleAr: string | null;
      abstract: string;
      abstractAr: string | null;
      similarity: number;
    }[] = [];
    for (const hit of hits) {
      const row = byId.get(hit.article_id);
      if (!row?.slug) {
        continue;
      }
      rows.push({
        id: row.id,
        slug: row.slug,
        title: row.title,
        titleAr: row.titleAr,
        abstract: row.abstract,
        abstractAr: row.abstractAr,
        similarity: hit.similarity,
      });
    }
    return rows;
  }
}
