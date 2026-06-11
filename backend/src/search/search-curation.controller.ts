import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { SearchService } from './search.service';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMinSize,
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
  constructor(private readonly searchService: SearchService) {}

  private requireEnabled(): void {
    if (!this.searchService.isEnabled()) {
      throw new ServiceUnavailableException({
        message: 'Typesense search is not enabled',
        code: 'TYPESENSE_DISABLED',
      });
    }
  }

  @Get('overrides')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
  async listOverrides() {
    this.requireEnabled();
    return this.searchService.getOverrides();
  }

  @Put('overrides/:id')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
  @ApiBody({ type: UpsertOverrideDto })
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
  async deleteOverride(@Param('id') id: string) {
    this.requireEnabled();
    await this.searchService.deleteOverride(id);
  }

  // ── Synonyms ────────────────────────────────────────────────────────────

  @Get('synonyms')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
  async listSynonyms() {
    this.requireEnabled();
    return this.searchService.getSynonyms();
  }

  @Put('synonyms/:id')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
  @ApiBody({ type: UpsertSynonymDto })
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
  async deleteSynonym(@Param('id') id: string) {
    this.requireEnabled();
    await this.searchService.deleteSynonym(id);
  }
}
