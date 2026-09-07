import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { Client } from 'typesense';
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import { TYPESENSE_CLIENT } from './typesense.client';
import type {
  PublicationDocument,
  SearchAnalyticsEntry,
  SearchAnalyticsResult,
  TypesenseOverrideRule,
  TypesenseSynonym,
} from './search.types';
import { Submission } from '../entities/submission.entity';
import { Journal } from '../entities/journal.entity';
import { journalEntryForSlug } from '../journals/journal-catalog';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { User } from '../entities/user.entity';
import type { PublicationCatalogFilters } from '../submissions/publication-catalog-search.util';
import { clampPublicationCatalogPagination } from '../submissions/publication-catalog-search.util';

const COLLECTION_SCHEMA = {
  name: 'publications',
  fields: [
    { name: 'id', type: 'string' as const },
    { name: 'slug', type: 'string' as const, index: false as const },
    { name: 'title', type: 'string' as const },
    { name: 'titleAr', type: 'string' as const, optional: true as const },
    { name: 'abstract', type: 'string' as const },
    { name: 'abstractAr', type: 'string' as const, optional: true as const },
    { name: 'keywords', type: 'string' as const, optional: true as const },
    { name: 'keywordsAr', type: 'string' as const, optional: true as const },
    {
      name: 'authorDisplayName',
      type: 'string' as const,
      optional: true as const,
    },
    {
      name: 'journalSlug',
      type: 'string' as const,
      facet: true as const,
      optional: true as const,
    },
    {
      name: 'disciplines',
      type: 'string[]' as const,
      facet: true as const,
      optional: true as const,
    },
    {
      name: 'articleType',
      type: 'string' as const,
      facet: true as const,
      optional: true as const,
    },
    { name: 'publishedAt', type: 'int64' as const },
  ],
  default_sorting_field: 'publishedAt',
};

// Field order matches QUERY_BY_WEIGHTS index-for-index.
// keywords/keywordsAr are author-assigned controlled vocabulary — weighted equal
// to title so "neural networks" hits the keywords field as strongly as the title.
const QUERY_BY =
  'title,titleAr,keywords,keywordsAr,abstract,abstractAr,authorDisplayName';
const QUERY_BY_WEIGHTS = '4,3,4,3,2,2,1';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly collectionName: string;
  private collectionReady = false;

  constructor(
    @Optional()
    @Inject(TYPESENSE_CLIENT)
    private readonly client: Client | null,
    @Inject('TYPESENSE_COLLECTION_NAME')
    private readonly rawCollectionName: string,
    @InjectRepository(Submission)
    private readonly submissionsRepo: Repository<Submission>,
    @InjectRepository(Journal)
    private readonly journalsRepo: Repository<Journal>,
  ) {
    this.collectionName = rawCollectionName;
  }

  /**
   * `journal_id` → slug, read once per process.
   *
   * Journals are frozen reference data seeded by migration (see
   * `journals/journal-catalog.ts`), so this cannot go stale within a process
   * without a deploy. Resolving here rather than at the call sites means an
   * indexing path never has to remember to load the `journal` relation.
   */
  private journalSlugCache: Map<string, string> | null = null;

  private async journalSlugById(): Promise<Map<string, string>> {
    if (!this.journalSlugCache) {
      const rows = await this.journalsRepo.find({ select: ['id', 'slug'] });
      this.journalSlugCache = new Map(rows.map((j) => [j.id, j.slug]));
    }
    return this.journalSlugCache;
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async ensureCollection(): Promise<void> {
    if (!this.client) return;
    const schema = { ...COLLECTION_SCHEMA, name: this.collectionName };
    try {
      const existing = await this.client
        .collections(this.collectionName)
        .retrieve();
      this.collectionReady = true;
      this.logger.log(
        `Typesense collection "${this.collectionName}" already exists`,
      );
      await this.addMissingFields(existing);
    } catch {
      await this.client.collections().create(schema as CollectionCreateSchema);
      this.collectionReady = true;
      this.logger.log(`Typesense collection "${this.collectionName}" created`);
    }
  }

  /**
   * A collection created by an earlier release keeps its old schema, and
   * filtering on a field it does not have is a Typesense error, not an empty
   * result. Adding fields is safe and additive; documents backfill on the next
   * reindex (`POST /search/reindex`).
   */
  private async addMissingFields(existing: {
    fields?: Array<{ name: string }>;
  }): Promise<void> {
    if (!this.client) return;
    const present = new Set((existing.fields ?? []).map((f) => f.name));
    const missing = COLLECTION_SCHEMA.fields.filter(
      (f) => !present.has(f.name),
    );
    if (missing.length === 0) return;
    try {
      await this.client.collections(this.collectionName).update({
        fields: missing.map((f) => ({ ...f, optional: true })),
      } as never);
      this.logger.log(
        `Typesense collection "${this.collectionName}" gained field(s): ${missing
          .map((f) => f.name)
          .join(', ')} — run a reindex to populate them`,
      );
    } catch (err) {
      this.logger.warn(
        `Could not add field(s) to "${this.collectionName}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async upsertDocument(
    submission: Submission,
    authorDisplayName: string,
  ): Promise<void> {
    if (!this.client) return;
    const doc: PublicationDocument = {
      id: submission.id,
      slug: submission.slug ?? '',
      title: submission.title ?? '',
      titleAr: submission.titleAr ?? '',
      abstract: submission.abstract ?? '',
      abstractAr: submission.abstractAr ?? '',
      keywords: submission.keywords ?? '',
      keywordsAr: submission.keywordsAr ?? '',
      authorDisplayName,
      journalSlug:
        (await this.journalSlugById()).get(submission.journalId) ?? '',
      disciplines: submission.disciplines ?? [],
      articleType: submission.articleType ?? '',
      publishedAt: submission.publishedAt
        ? submission.publishedAt.getTime()
        : Date.now(),
    };
    await this.client
      .collections(this.collectionName)
      .documents()
      .upsert(doc as unknown as Record<string, unknown>);
  }

  async deleteDocument(id: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.collections(this.collectionName).documents(id).delete();
    } catch (err) {
      this.logger.warn(`Failed to delete document ${id}: ${String(err)}`);
    }
  }

  async getStatus(): Promise<{
    enabled: boolean;
    collectionReady: boolean;
    documentCount?: number;
  }> {
    if (!this.client) return { enabled: false, collectionReady: false };
    try {
      const col = await this.client.collections(this.collectionName).retrieve();
      return {
        enabled: true,
        collectionReady: true,
        documentCount: (col as { num_documents?: number }).num_documents,
      };
    } catch {
      return { enabled: true, collectionReady: false };
    }
  }

  async dropCollection(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.collections(this.collectionName).delete();
      this.collectionReady = false;
      this.logger.log(`Typesense collection "${this.collectionName}" dropped`);
    } catch (err) {
      this.logger.warn(`Failed to drop collection: ${String(err)}`);
    }
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  /** Creates/updates the popular-queries and no-hits analytics rules. */
  async ensureAnalyticsRules(): Promise<void> {
    if (!this.client) return;
    // The typesense-js v3 client types don't fully expose the analytics API,
    // so we cast to access it.
    const analytics = (
      this.client as unknown as {
        analytics: {
          rules(): {
            upsert(name: string, rule: unknown): Promise<unknown>;
          };
        };
      }
    ).analytics;

    try {
      await analytics.rules().upsert(`${this.collectionName}-popular-queries`, {
        type: 'popular_queries',
        params: {
          source: { collections: [this.collectionName] },
          destination: {
            collection: `${this.collectionName}_popular_queries`,
          },
          limit: 1000,
        },
      });
      await analytics.rules().upsert(`${this.collectionName}-nohits-queries`, {
        type: 'nohits_queries',
        params: {
          source: { collections: [this.collectionName] },
          destination: {
            collection: `${this.collectionName}_nohits_queries`,
          },
          limit: 1000,
        },
      });
      this.logger.log('Typesense analytics rules ensured');
    } catch (err) {
      this.logger.warn(`Failed to ensure analytics rules: ${String(err)}`);
    }
  }

  /** Records a reader click event so Typesense can compute click-through rates. */
  async recordClickEvent(
    q: string,
    docId: string,
    userId: string,
  ): Promise<void> {
    if (!this.client) return;
    try {
      const analytics = (
        this.client as unknown as {
          analytics: {
            events(): {
              create(event: unknown): Promise<unknown>;
            };
          };
        }
      ).analytics;
      await analytics.events().create({
        type: 'click',
        name: `${this.collectionName}_click`,
        data: { q, doc_id: docId, user_id: userId },
      });
    } catch (err) {
      this.logger.warn(`Failed to record click event: ${String(err)}`);
    }
  }

  /** Returns top queries and zero-result queries for the editor analytics view. */
  async getAnalytics(): Promise<SearchAnalyticsResult> {
    if (!this.client) return { topQueries: [], noResultQueries: [] };

    const popularColl = `${this.collectionName}_popular_queries`;
    const nohitsColl = `${this.collectionName}_nohits_queries`;
    const searchParams = {
      q: '*',
      query_by: 'q',
      sort_by: 'count:desc',
      per_page: 20,
    };

    const [popularResult, nohitsResult] = await Promise.allSettled([
      this.client
        .collections(popularColl)
        .documents()
        .search(searchParams as never),
      this.client
        .collections(nohitsColl)
        .documents()
        .search(searchParams as never),
    ]);

    const mapHits = (
      result: PromiseSettledResult<unknown>,
    ): SearchAnalyticsEntry[] => {
      if (result.status === 'rejected') return [];
      const res = result.value as {
        hits?: Array<{ document: { q: string; count: number } }>;
      };
      return (res.hits ?? []).map((h) => ({
        q: h.document.q,
        count: h.document.count,
      }));
    };

    return {
      topQueries: mapHits(popularResult),
      noResultQueries: mapHits(nohitsResult),
    };
  }

  async searchAsSubmissions(
    filters: PublicationCatalogFilters,
    pagination?: { limit?: number; offset?: number },
  ): Promise<{ items: Submission[]; total: number }> {
    if (!this.client) {
      return { items: [], total: 0 };
    }
    const { limit, offset } = clampPublicationCatalogPagination(
      pagination?.limit,
      pagination?.offset,
    );

    const q = filters.q?.trim() || '*';

    const filterParts: string[] = [];
    if (filters.journal) {
      filterParts.push(`journalSlug:=${JSON.stringify(filters.journal)}`);
    }
    if (filters.discipline) {
      filterParts.push(`disciplines:=${JSON.stringify(filters.discipline)}`);
    }
    if (filters.articleType) {
      filterParts.push(`articleType:=${JSON.stringify(filters.articleType)}`);
    }
    if (filters.publishedFrom) {
      filterParts.push(`publishedAt:>=${filters.publishedFrom.getTime()}`);
    }
    if (filters.publishedTo) {
      filterParts.push(`publishedAt:<=${filters.publishedTo.getTime()}`);
    }

    // When author filter is active, incorporate it into the query so Typesense
    // applies fuzzy/prefix matching on the name rather than an exact filter_by.
    const authorTerm = filters.author?.trim();
    const effectiveQ =
      authorTerm && q === '*'
        ? authorTerm
        : authorTerm
          ? `${q} ${authorTerm}`
          : q;
    // Restrict query_by to authorDisplayName only when author-only search.
    const effectiveQueryBy =
      authorTerm && !filters.q?.trim() ? 'authorDisplayName' : QUERY_BY;
    const effectiveWeights =
      authorTerm && !filters.q?.trim() ? '1' : QUERY_BY_WEIGHTS;

    const isKeywordSearch = effectiveQ !== '*';
    const searchParams: Record<string, unknown> = {
      q: effectiveQ,
      query_by: effectiveQueryBy,
      query_by_weights: effectiveWeights,
      per_page: limit,
      offset,
      prefix: isKeywordSearch, // enable prefix matching for instant-search feel
      sort_by: isKeywordSearch
        ? '_text_match:desc,publishedAt:desc'
        : 'publishedAt:desc',
      // Allow 1 typo on tokens ≥ 4 chars; keeps short academic abbreviations exact
      num_typos: 1,
      typo_tokens_threshold: 1,
      min_len_1typo: 4,
      min_len_2typo: 8,
    };
    if (filterParts.length > 0) {
      searchParams['filter_by'] = filterParts.join(' && ');
    }

    const result = await this.client
      .collections(this.collectionName)
      .documents()
      .search(searchParams as never);

    const hits = (result.hits ?? []) as Array<{
      document: PublicationDocument;
    }>;
    const items = hits.map((hit) => {
      const doc = hit.document;
      const sub = new Submission();
      sub.id = doc.id;
      sub.slug = doc.slug;
      sub.title = doc.title;
      sub.titleAr = doc.titleAr || null;
      sub.abstract = doc.abstract;
      sub.abstractAr = doc.abstractAr || null;
      sub.keywords = doc.keywords || null;
      // Titles come from the frozen catalog rather than a second query: the
      // slug in the index is the same contract the portal URLs use.
      const journalEntry = journalEntryForSlug(doc.journalSlug ?? '');
      if (journalEntry) {
        const journal = new Journal();
        journal.slug = journalEntry.slug;
        journal.titleAr = journalEntry.titleAr;
        journal.titleEn = journalEntry.titleEn;
        sub.journal = journal;
      }
      sub.keywordsAr = doc.keywordsAr || null;
      sub.disciplines = doc.disciplines ?? [];
      sub.articleType = (doc.articleType as Submission['articleType']) || null;
      sub.publishedAt = doc.publishedAt ? new Date(doc.publishedAt) : null;
      const author = new User();
      author.displayName = doc.authorDisplayName || '';
      sub.author = author;
      return sub;
    });

    const total = result.found ?? 0;
    return { items, total };
  }

  async resolvePublicationLabels(
    ids: string[],
  ): Promise<Array<{ id: string; slug: string | null; title: string }>> {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (unique.length === 0) return [];
    const rows = await this.submissionsRepo.find({
      where: { id: In(unique), status: SubmissionStatus.PUBLISHED },
      select: { id: true, slug: true, title: true },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
    }));
  }

  async getOverrides(): Promise<TypesenseOverrideRule[]> {
    if (!this.client) return [];
    const result = await this.client
      .collections(this.collectionName)
      .overrides()
      .retrieve();
    return (result.overrides ?? []) as unknown as TypesenseOverrideRule[];
  }

  async upsertOverride(
    id: string,
    body: Omit<TypesenseOverrideRule, 'id'>,
  ): Promise<TypesenseOverrideRule> {
    if (!this.client) throw new Error('Typesense is not enabled');
    const result = await this.client
      .collections(this.collectionName)
      .overrides()
      .upsert(id, body as never);
    return result as unknown as TypesenseOverrideRule;
  }

  async deleteOverride(id: string): Promise<void> {
    if (!this.client) throw new Error('Typesense is not enabled');
    await this.client.collections(this.collectionName).overrides(id).delete();
  }

  async getSynonyms(): Promise<TypesenseSynonym[]> {
    if (!this.client) return [];
    const result = await this.client
      .collections(this.collectionName)
      .synonyms()
      .retrieve();
    return (result.synonyms ?? []) as unknown as TypesenseSynonym[];
  }

  async upsertSynonym(
    id: string,
    body: Omit<TypesenseSynonym, 'id'>,
  ): Promise<TypesenseSynonym> {
    if (!this.client) throw new Error('Typesense is not enabled');
    const result = await this.client
      .collections(this.collectionName)
      .synonyms()
      .upsert(id, body as never);
    return result as unknown as TypesenseSynonym;
  }

  async deleteSynonym(id: string): Promise<void> {
    if (!this.client) throw new Error('Typesense is not enabled');
    await this.client.collections(this.collectionName).synonyms(id).delete();
  }
}
