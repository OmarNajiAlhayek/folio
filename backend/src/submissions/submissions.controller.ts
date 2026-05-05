import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { createReadStream } from 'fs';
import { SubmissionsService } from './submissions.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import { UpdateReviewMethodDto } from './dto/update-review-method.dto';
import { UpdateSubmissionFileStageDto } from './dto/update-submission-file-stage.dto';
import { GenerateDocxDto } from './dto/constructor-content.dto';
import type { ConstructorContent } from './constructor-content.types';
import { Readable } from 'stream';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { SubmissionStatus } from '../entities/submission-status.enum';
import { SUBMISSION_FILE_KINDS } from './submission-file-kinds';

@ApiTags('submissions')
@Controller('submissions')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@ApiBearerAuth('JWT')
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateSubmissionDto) {
    return this.submissionsService.create(user.sub, dto);
  }

  @Get()
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

  @Get(':slug')
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

  @Patch(':slug')
  update(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateSubmissionDto,
  ) {
    return this.submissionsService.update(slug, user, dto);
  }

  @Post(':slug/submit')
  submit(@Param('slug') slug: string, @CurrentUser() user: RequestUser) {
    return this.submissionsService.submit(slug, user);
  }

  @Patch(':slug/status')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_CHANGE_STATUS)
  updateStatus(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.submissionsService.updateStatus(slug, user, dto.status);
  }

  @Post(':slug/assignments')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER)
  assignReviewer(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: AssignReviewerDto,
  ) {
    return this.submissionsService.assignReviewer(slug, dto.reviewerId, user);
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
  listReviews(@Param('slug') slug: string, @CurrentUser() user: RequestUser) {
    return this.submissionsService.listReviews(slug, user);
  }

  @Post(':slug/files')
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
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
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
  async generateDocx(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: GenerateDocxDto,
    @Query('attach') attachQuery?: string,
  ) {
    const attach =
      dto.attach === true || attachQuery === 'true' || attachQuery === '1';
    const result = await this.submissionsService.generateDocx(
      slug,
      user,
      dto.content as unknown as ConstructorContent,
      { attach },
    );
    if (result.kind === 'attached') {
      return result.file;
    }
    return new StreamableFile(Readable.from(result.data), {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      disposition: `attachment; filename="${slug}-constructor.docx"`,
    });
  }

  /**
   * Generate a Word file directly from constructor content without requiring
   * an existing submission slug. Intended for the pre-submission constructor flow.
   */
  @Post('generate-docx-standalone')
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
}
