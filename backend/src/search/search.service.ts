import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Client } from 'typesense';
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import { TYPESENSE_CLIENT } from './typesense.client';
import type {
  PublicationDocument,
  TypesenseOverrideRule,
  TypesenseSynonym,
} from './search.types';
import { Submission } from '../entities/submission.entity';
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
      name: 'discipline',
      type: 'string' as const,
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
  ) {
    this.collectionName = rawCollectionName;
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async ensureCollection(): Promise<void> {
    if (!this.client) return;
    const schema = { ...COLLECTION_SCHEMA, name: this.collectionName };
    try {
      await this.client.collections(this.collectionName).retrieve();
      this.collectionReady = true;
      this.logger.log(
        `Typesense collection "${this.collectionName}" already exists`,
      );
    } catch {
      await this.client.collections().create(schema as CollectionCreateSchema);
      this.collectionReady = true;
      this.logger.log(`Typesense collection "${this.collectionName}" created`);
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
      discipline: submission.discipline ?? '',
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
    if (filters.discipline) {
      filterParts.push(`discipline:=${JSON.stringify(filters.discipline)}`);
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
      sub.keywordsAr = doc.keywordsAr || null;
      sub.discipline = doc.discipline || null;
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
