import {
  Body,
  Controller,
  Get,
  HttpCode,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { IsString, MaxLength } from 'class-validator';
import { JournalSettingsService } from './journal-settings.service';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';

class SetGuidelinesDto {
  @IsString()
  @MaxLength(50000)
  value: string;
}

@ApiTags('journal-settings')
@Controller('journal/settings')
export class JournalSettingsController {
  constructor(private readonly service: JournalSettingsService) {}

  @Get('reviewer-guidelines')
  async getReviewerGuidelines() {
    const value = await this.service.getReviewerGuidelines();
    return { key: 'reviewer_guidelines', value };
  }

  @Put('reviewer-guidelines')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @ApiBearerAuth('JWT')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER)
  async setReviewerGuidelines(@Body() dto: SetGuidelinesDto) {
    await this.service.setReviewerGuidelines(dto.value);
    return { key: 'reviewer_guidelines', value: dto.value };
  }
}
