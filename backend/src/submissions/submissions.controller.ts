import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { FolioThrottlerGuard } from '../common/guards/folio-throttler.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { submissionFileMulterOptions } from './submission-file-multer.options';
import { createReadStream } from 'fs';
import { SubmissionsService } from './submissions.service';
import { DocxImportService } from './docx-import.service';
import { constructorDocxMulterOptions } from './constructor-docx-multer.options';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import { AssignCopyeditorDto } from './dto/assign-copyeditor.dto';
import { UpdateReviewMethodDto } from './dto/update-review-method.dto';
import { UpdateSubmissionFileStageDto } from './dto/update-submission-file-stage.dto';
import { GenerateDocxDto } from './dto/constructor-content.dto';
import { SubmitSubmissionDto } from './dto/submit-submission.dto';
import { PatchDisciplineDto } from './dto/patch-discipline.dto';
import { SuggestKeywordsPreviewDto } from './dto/suggest-keywords-preview.dto';
import type { ConstructorContent } from './constructor-content.types';
import { Readable } from 'stream';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import {
  PERMISSION_SLUGS,
  SUBMISSION_LIST_PERMISSIONS,
  SUBMISSION_READ_PERMISSIONS,
} from '../rbac/permission-slugs';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SUBMISSION_FILE_KINDS } from './submission-file-kinds';

@ApiTags('submissions')
@Controller('submissions')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@ApiBearerAuth('JWT')
export class SubmissionsController {
  constructor(
    private readonly submissionsService: SubmissionsService,
    private readonly docxImportService: DocxImportService,
  ) {}

  @Post()
  @Permissions(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateSubmissionDto) {
    return this.submissionsService.create(user.sub, dto);
  }

  /**
   * Generate a Word file directly from constructor content without requiring
   * an existing submission slug. Declared before `:slug/*` routes.
   */
  /**
   * Parse a `.docx` into `ConstructorContent` for the Word Constructor UI.
   * Declared before `:slug/*` routes.
   */
  @Post('import-docx-to-constructor')
  @UseGuards(FolioThrottlerGuard)
  @Throttle({ upload: {} })
  @Permissions(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', constructorDocxMulterOptions))
  importDocxToConstructor(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        message: 'Word file is required',
        code: 'VALIDATION_ERROR',
      });
    }
    return this.docxImportService.importFromBuffer(file.buffer);
  }

  @Post('generate-docx-standalone')
  @UseGuards(FolioThrottlerGuard)
  @Throttle({ docx: {} })
  @Permissions(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN)
  async generateStandaloneDocx(
    @Body() dto: GenerateDocxDto,
    @CurrentUser() _user: RequestUser,
  ) {
    const buffer = await this.submissionsService.generateDocxStandalone(
      dto.content as unknown as ConstructorContent,
    );
    return new StreamableFile(Readable.from(buffer), {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      disposition: 'attachment; filename="constructor.docx"',
    });
  }

  /**
   * Suggest keywords from in-form metadata before a submission slug exists (new-submission wizard).
   */
  @Post('suggest-keywords-preview')
  @UseGuards(FolioThrottlerGuard)
  @Throttle({ default: {} })
  @Permissions(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN)
  suggestKeywordsPreview(
    @CurrentUser() user: RequestUser,
    @Body() dto: SuggestKeywordsPreviewDto,
  ) {
    return this.submissionsService.suggestKeywordsPreview(user, dto);
  }

  @Get('discipline-labels')
  @Permissions(
    PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN,
    PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE,
  )
  listDisciplineLabels() {
    return this.submissionsService.listDisciplineLabels();
  }

  @Get()
  @Permissions(...SUBMISSION_LIST_PERMISSIONS)
  findAll(@CurrentUser() user: RequestUser, @Query('status') status?: string) {
    let s: SubmissionStatus | undefined;
    if (
      status &&
      (Object.values(SubmissionStatus) as string[]).includes(status)
    ) {
      s = status as SubmissionStatus;
    }
    return this.submissionsService.findAllForUser(user, s);
  }

  @Get(':slug/corpus-similarity')
  @Permissions(...SUBMISSION_READ_PERMISSIONS)
  getCorpusSimilarity(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.submissionsService.getCorpusSimilarityReport(slug, user);
  }

  @Get(':slug/suggested-reviewers')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER)
  getSuggestedReviewers(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.submissionsService.getSuggestedReviewers(slug, user);
  }

  @Get(':slug')
  @Permissions(...SUBMISSION_READ_PERMISSIONS)
  findOne(@Param('slug') slug: string, @CurrentUser() user: RequestUser) {
    return this.submissionsService.findOneForUser(slug, user);
  }

  @Patch(':slug/review-method')
  @Permissions(
    PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
    PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER,
  )
  updateReviewMethod(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateReviewMethodDto,
  ) {
    return this.submissionsService.updateReviewMethod(
      slug,
      user,
      dto.reviewMethod,
    );
  }

  @Patch(':slug/files/:fileId/stage')
  @Permissions(
    PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS,
    PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER,
  )
  updateSubmissionFileStage(
    @Param('slug') slug: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateSubmissionFileStageDto,
  ) {
    return this.submissionsService.updateSubmissionFileStage(
      slug,
      fileId,
      user,
      dto.fileStage,
    );
  }

  @Post(':slug/suggest-discipline')
  @UseGuards(FolioThrottlerGuard)
  @Throttle({ default: {} })
  @Permissions(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN)
  suggestDiscipline(@Param('slug') slug: string, @CurrentUser() user: RequestUser) {
    return this.submissionsService.suggestDiscipline(slug, user);
  }

  @Post(':slug/suggest-keywords')
  @UseGuards(FolioThrottlerGuard)
  @Throttle({ default: {} })
  @Permissions(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN)
  suggestKeywords(@Param('slug') slug: string, @CurrentUser() user: RequestUser) {
    return this.submissionsService.suggestKeywords(slug, user);
  }

  @Patch(':slug/discipline')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN)
  patchDiscipline(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: PatchDisciplineDto,
  ) {
    return this.submissionsService.setDisciplineForUser(slug, user, dto.discipline);
  }

  @Patch(':slug')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN)
  update(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateSubmissionDto,
  ) {
    return this.submissionsService.update(slug, user, dto);
  }

  @Post(':slug/submit')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN)
  submit(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: SubmitSubmissionDto,
  ) {
    return this.submissionsService.submit(slug, user, {
      constructorContent: dto.constructorContent as
        | ConstructorContent
        | undefined,
      useUploadedManuscript: dto.useUploadedManuscript,
      presentUploadedManuscript: dto.presentUploadedManuscript,
      presentConstructorManuscript: dto.presentConstructorManuscript,
    });
  }

  @Patch(':slug/status')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS)
  updateStatus(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateStatusDto,
    @Headers('x-folio-locale') folioLocale?: string,
  ) {
    return this.submissionsService.updateStatus(
      slug,
      user,
      dto.status,
      folioLocale,
    );
  }

  @Post(':slug/assignments')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER)
  assignReviewer(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: AssignReviewerDto,
    @Headers('x-folio-locale') folioLocale?: string,
  ) {
    return this.submissionsService.assignReviewer(
      slug,
      dto.reviewerId,
      user,
      folioLocale,
    );
  }

  @Get(':slug/assignments')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_LIST_ASSIGNMENTS)
  listAssignments(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.submissionsService.listAssignments(slug, user);
  }

  @Get(':slug/reviews')
  @Permissions(...SUBMISSION_READ_PERMISSIONS)
  listReviews(@Param('slug') slug: string, @CurrentUser() user: RequestUser) {
    return this.submissionsService.listReviews(slug, user);
  }

  @Post(':slug/copyedit-assignments')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_ASSIGN_COPYEDITOR)
  assignCopyeditor(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: AssignCopyeditorDto,
  ) {
    return this.submissionsService.assignCopyeditor(slug, dto.copyeditorId, user);
  }

  @Get(':slug/copyedit-assignments')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_VIEW_EDITOR_QUEUE)
  listCopyeditAssignments(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.submissionsService.listCopyeditAssignments(slug, user);
  }

  @Get(':slug/copyedit-notes')
  @Permissions(...SUBMISSION_READ_PERMISSIONS)
  listCopyeditNotes(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.submissionsService.listCopyeditNotes(slug, user);
  }

  @Post(':slug/publish')
  @Permissions(PERMISSION_SLUGS.COPYEDIT_PUBLISH)
  publish(@Param('slug') slug: string, @CurrentUser() user: RequestUser) {
    return this.submissionsService.publishSubmission(slug, user);
  }

  @Post(':slug/files')
  @UseGuards(FolioThrottlerGuard)
  @Throttle({ upload: {} })
  @Permissions(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN)
  @ApiConsumes('multipart/form-data')
  @ApiQuery({
    name: 'kind',
    required: false,
    enum: SUBMISSION_FILE_KINDS,
    description: 'File kind (defaults to manuscript)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', submissionFileMulterOptions))
  async uploadFile(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Query('kind') kind: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException({
        message: 'File is required',
        code: 'VALIDATION_ERROR',
      });
    }
    return this.submissionsService.addFile(slug, user, file, kind);
  }

  @Get(':slug/files/:fileId')
  @Permissions(...SUBMISSION_READ_PERMISSIONS)
  async downloadFile(
    @Param('slug') slug: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const { file, path } = await this.submissionsService.getFileForUser(
      slug,
      fileId,
      user,
    );
    return new StreamableFile(createReadStream(path), {
      type: file.mimeType,
      disposition: `inline; filename="${encodeURIComponent(file.originalName)}"`,
    });
  }

  @Delete(':slug/files/:fileId')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN)
  deleteFile(
    @Param('slug') slug: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.submissionsService.deleteFile(slug, fileId, user);
  }

  /**
   * Generate a Word file from constructor content. The content is read
   * from the request body so the result reflects the latest in-memory
   * editor state — no DB read race with debounced auto-saves.
   *
   *   ?attach=true → save the result as the submission's manuscript file
   *                  (replacing any existing) and return the file row.
   *   default      → stream the binary as a download.
   */
  @Post(':slug/generate-docx')
  @UseGuards(FolioThrottlerGuard)
  @Throttle({ docx: {} })
  @Permissions(PERMISSION_SLUGS.SUBMISSION_MANAGE_OWN)
  async generateDocx(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: GenerateDocxDto,
    @Query('attach') attachQuery?: string,
  ) {
    const attach =
      dto.attach === true || attachQuery === 'true' || attachQuery === '1';
    const attachKind =
      dto.attachKind === 'manuscript_constructor'
        ? 'manuscript_constructor'
        : 'manuscript';
    const result = await this.submissionsService.generateDocx(
      slug,
      user,
      dto.content as unknown as ConstructorContent,
      { attach, attachKind },
    );
    if (result.kind === 'attached') {
      return result.file;
    }
    return new StreamableFile(Readable.from(result.data), {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      disposition: `attachment; filename="${slug}-constructor.docx"`,
    });
  }

}
