import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createReadStream } from 'fs';
import { SubmissionsService } from '../submissions/submissions.service';
import { AuthorSuggestionsQueryDto } from './dto/author-suggestions.query.dto';
import {
  ListPublicSubmissionsQueryDto,
  toPublicationCatalogFilters,
} from './dto/list-public-submissions.query.dto';
import { PUBLICATION_AUTHOR_SUGGESTION_DEFAULT_LIMIT } from '../submissions/publication-catalog-search.util';
import { SubmissionArticleType } from '../entities/submission-article-type.enum';
import { ARABIC_DISCIPLINE_LABELS } from '../ai/discipline-labels';

@ApiTags('public')
@Controller('public/submissions')
@Throttle({ public: {} })
export class PublicSubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Get()
  @ApiQuery({ name: 'q', required: false, description: 'Quick catalog search' })
  @ApiQuery({
    name: 'author',
    required: false,
    description: 'Advanced author narrowing filter',
  })
  @ApiQuery({
    name: 'discipline',
    required: false,
    enum: ARABIC_DISCIPLINE_LABELS,
  })
  @ApiQuery({
    name: 'articleType',
    required: false,
    enum: SubmissionArticleType,
  })
  @ApiQuery({ name: 'publishedFrom', required: false, example: '2024-01-15' })
  @ApiQuery({ name: 'publishedTo', required: false, example: '2024-12-31' })
  @ApiQuery({
    name: 'searchMode',
    required: false,
    enum: ['keyword', 'semantic'],
    description: 'keyword (default) or semantic (requires q)',
  })
  @ApiQuery({
    name: 'semanticLimit',
    required: false,
    description: 'Max semantic hits (1–30, default 20)',
  })
  async list(@Query() query: ListPublicSubmissionsQueryDto) {
    const filters = toPublicationCatalogFilters(query);
    if (query.searchMode === 'semantic' && filters.q) {
      const limit =
        query.semanticLimit != null
          ? Math.min(30, Math.max(1, query.semanticLimit))
          : 20;
      return this.submissionsService.findPublishedSemanticList(filters, limit);
    }
    const items = await this.submissionsService.findPublishedList(filters);
    return items.map((s) => this.submissionsService.toPublicationListItem(s));
  }

  @Get('author-suggestions')
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Partial author display name (min 2 characters)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max suggestions (1–20, default 10)',
  })
  async authorSuggestions(@Query() query: AuthorSuggestionsQueryDto) {
    const limit = query.limit ?? PUBLICATION_AUTHOR_SUGGESTION_DEFAULT_LIMIT;
    return this.submissionsService.findPublishedAuthorSuggestions(
      query.q,
      limit,
    );
  }

  @Get(':slug/related')
  async related(
    @Param('slug') slug: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit != null ? parseInt(limit, 10) : 5;
    const lim = Number.isFinite(parsed)
      ? Math.min(10, Math.max(1, parsed))
      : 5;
    return this.submissionsService.findRelatedPublications(slug, lim);
  }

  @Get(':slug')
  async detail(@Param('slug') slug: string) {
    const s = await this.submissionsService.findPublishedOne(slug);
    const files = (s.files ?? []).filter((f) => f.isPublic);
    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      titleAr: s.titleAr,
      abstract: s.abstract,
      abstractAr: s.abstractAr,
      keywords: s.keywords,
      keywordsAr: s.keywordsAr,
      discipline: s.discipline,
      articleType: s.articleType,
      publishedAt: s.publishedAt,
      author: s.author
        ? {
            displayName: s.author.displayName,
          }
        : undefined,
      files: files.map((f) => ({
        id: f.id,
        originalName: f.originalName,
        mimeType: f.mimeType,
      })),
    };
  }

  @Get(':slug/files/:fileId')
  async downloadFile(
    @Param('slug') slug: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    const { file, path } = await this.submissionsService.getFileForUser(
      slug,
      fileId,
      null,
    );
    return new StreamableFile(createReadStream(path), {
      type: file.mimeType,
      disposition: `inline; filename="${encodeURIComponent(file.originalName)}"`,
    });
  }
}
