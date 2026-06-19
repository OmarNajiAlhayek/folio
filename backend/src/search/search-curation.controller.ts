import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { SearchService } from './search.service';
import { SearchSyncService } from './search-sync.service';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class OverrideRuleDto {
  @IsString() query: string;
  @IsIn(['exact', 'contains']) match: 'exact' | 'contains';
}

class OverrideIncludeDto {
  @IsString() id: string;
  @IsNumber() position: number;
}

class OverrideExcludeDto {
  @IsString() id: string;
}

class UpsertSynonymDto {
  /** Omit root for multi-way (all terms equivalent). Set root for one-way. */
  @IsOptional()
  @IsString()
  root?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  synonyms: string[];
}

class UpsertOverrideDto {
  @ValidateNested()
  @Type(() => OverrideRuleDto)
  rule: OverrideRuleDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OverrideIncludeDto)
  includes?: OverrideIncludeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OverrideExcludeDto)
  excludes?: OverrideExcludeDto[];
}

@ApiTags('editor-search')
@Controller('editor/search')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@ApiBearerAuth('JWT')
export class SearchCurationController {
  private readonly logger = new Logger(SearchCurationController.name);

  constructor(
    private readonly searchService: SearchService,
    private readonly searchSyncService: SearchSyncService,
  ) {}

  private requireEnabled(): void {
    if (!this.searchService.isEnabled()) {
      throw new ServiceUnavailableException({
        message:
          'Search curation is unavailable because publication search is not enabled',
        code: 'TYPESENSE_DISABLED',
      });
    }
  }

  @Get('status')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
  @ApiOperation({ summary: 'Search engine health and document count' })
  @ApiResponse({
    status: 200,
    description:
      'Returns enabled state, collection readiness, and indexed document count',
  })
  async getStatus() {
    return this.searchService.getStatus();
  }

  @Get('article-labels')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
  @ApiOperation({
    summary: 'Resolve published article titles by submission id',
  })
  @ApiResponse({
    status: 200,
    description: 'Array of { id, slug, title } for known published submissions',
  })
  @ApiResponse({ status: 503, description: 'Typesense is not enabled' })
  async getArticleLabels(@Query('ids') ids?: string) {
    this.requireEnabled();
    const idList = (ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (idList.length > 100) {
      throw new BadRequestException({
        message: 'At most 100 ids per request',
        code: 'VALIDATION_ERROR',
      });
    }
    return this.searchService.resolvePublicationLabels(idList);
  }

  @Get('analytics')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
  @ApiOperation({
    summary: 'Search analytics: top queries and zero-result queries',
  })
  @ApiResponse({
    status: 200,
    description:
      'Top 20 most searched terms and top 20 searches that returned no results',
  })
  @ApiResponse({ status: 503, description: 'Typesense is not enabled' })
  async getAnalytics() {
    this.requireEnabled();
    return this.searchService.getAnalytics();
  }

  @Post('reindex')
  @HttpCode(HttpStatus.ACCEPTED)
  @Permissions(PERMISSION_SLUGS.USERS_MANAGE_ROLES)
  @ApiOperation({
    summary: 'Trigger a full search reindex (journal manager only)',
  })
  @ApiResponse({
    status: 202,
    description: 'Reindex started in the background',
  })
  @ApiResponse({ status: 409, description: 'A reindex is already in progress' })
  @ApiResponse({ status: 503, description: 'Typesense is not enabled' })
  triggerReindex() {
    this.requireEnabled();
    if (this.searchSyncService.isReindexInProgress()) {
      throw new ConflictException({
        message: 'A reindex is already in progress',
        code: 'REINDEX_IN_PROGRESS',
      });
    }
    void this.searchSyncService.reindex().catch((err: unknown) => {
      this.logger.error(
        `Reindex failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    return { message: 'Reindex started' };
  }

  // ── Overrides ────────────────────────────────────────────────────────────

  @Get('overrides')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
  @ApiOperation({ summary: 'List all search result overrides' })
  @ApiResponse({ status: 200, description: 'Array of query override rules' })
  @ApiResponse({ status: 503, description: 'Typesense is not enabled' })
  async listOverrides() {
    this.requireEnabled();
    return this.searchService.getOverrides();
  }

  @Put('overrides/:id')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
  @ApiOperation({ summary: 'Create or update a search result override' })
  @ApiBody({ type: UpsertOverrideDto })
  @ApiResponse({ status: 200, description: 'Saved override rule' })
  @ApiResponse({ status: 503, description: 'Typesense is not enabled' })
  async upsertOverride(
    @Param('id') id: string,
    @Body() body: UpsertOverrideDto,
  ) {
    this.requireEnabled();
    if (!id || id.trim() === '') {
      throw new BadRequestException({
        message: 'Override id is required',
        code: 'VALIDATION_ERROR',
      });
    }
    return this.searchService.upsertOverride(id.trim(), body);
  }

  @Delete('overrides/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
  @ApiOperation({ summary: 'Delete a search result override' })
  @ApiResponse({ status: 204, description: 'Override deleted' })
  @ApiResponse({ status: 503, description: 'Typesense is not enabled' })
  async deleteOverride(@Param('id') id: string) {
    this.requireEnabled();
    await this.searchService.deleteOverride(id);
  }

  // ── Synonyms ────────────────────────────────────────────────────────────

  @Get('synonyms')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
  @ApiOperation({ summary: 'List all search synonyms' })
  @ApiResponse({
    status: 200,
    description: 'Array of synonym rules (multi-way and one-way)',
  })
  @ApiResponse({ status: 503, description: 'Typesense is not enabled' })
  async listSynonyms() {
    this.requireEnabled();
    return this.searchService.getSynonyms();
  }

  @Put('synonyms/:id')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
  @ApiOperation({ summary: 'Create or update a search synonym' })
  @ApiBody({ type: UpsertSynonymDto })
  @ApiResponse({ status: 200, description: 'Saved synonym rule' })
  @ApiResponse({ status: 503, description: 'Typesense is not enabled' })
  async upsertSynonym(@Param('id') id: string, @Body() body: UpsertSynonymDto) {
    this.requireEnabled();
    if (!id.trim()) {
      throw new BadRequestException({
        message: 'Synonym id is required',
        code: 'VALIDATION_ERROR',
      });
    }
    return this.searchService.upsertSynonym(id.trim(), body);
  }

  @Delete('synonyms/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
  @ApiOperation({ summary: 'Delete a search synonym' })
  @ApiResponse({ status: 204, description: 'Synonym deleted' })
  @ApiResponse({ status: 503, description: 'Typesense is not enabled' })
  async deleteSynonym(@Param('id') id: string) {
    this.requireEnabled();
    await this.searchService.deleteSynonym(id);
  }
}
