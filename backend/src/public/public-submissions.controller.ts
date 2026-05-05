import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'fs';
import { SubmissionsService } from '../submissions/submissions.service';

@ApiTags('public')
@Controller('public/submissions')
export class PublicSubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Get()
  async list() {
    const items = await this.submissionsService.findPublishedList();
    return items.map((s) => this.submissionsService.toPublicationListItem(s));
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
            email: s.author.email,
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
