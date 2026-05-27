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
import {
  ListPublicSubmissionsQueryDto,
  toPublicationCatalogFilters,
} from './dto/list-public-submissions.query.dto';
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
  async list(@Query() query: ListPublicSubmissionsQueryDto) {
    const filters = toPublicationCatalogFilters(query);
    const items = await this.submissionsService.findPublishedList(filters);
    return items.map((s) => this.submissionsService.toPublicationListItem(s));
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
