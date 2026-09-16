import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { RequestUser } from '../common/types/request-user';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import {
  EditorialBoardMemberDto,
  ReorderEditorialBoardDto,
} from './dto/editorial-board.dto';
import { UpdateJournalMetadataDto } from './dto/update-journal-metadata.dto';
import { EditorialBoardService } from './editorial-board.service';
import { JournalMetadataService } from './journal-metadata.service';

/**
 * Staff editing of journal metadata and editorial boards. The guard admits
 * anyone holding `journal.edit_metadata`; which journals and which fields is
 * decided in the services, because the guard cannot see memberships.
 */
@ApiTags('journals')
@Controller('journals')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@ApiBearerAuth('JWT')
export class JournalAdminController {
  constructor(
    private readonly metadata: JournalMetadataService,
    private readonly board: EditorialBoardService,
  ) {}

  @Get('editable')
  @Permissions(PERMISSION_SLUGS.JOURNAL_EDIT_METADATA)
  listEditable(@CurrentUser() user: RequestUser) {
    return this.metadata.listEditable(user);
  }

  @Patch(':slug')
  @Permissions(PERMISSION_SLUGS.JOURNAL_EDIT_METADATA)
  update(
    @CurrentUser() user: RequestUser,
    @Param('slug') slug: string,
    @Body() dto: UpdateJournalMetadataDto,
  ) {
    return this.metadata.update(user, slug, dto);
  }

  @Get(':slug/editorial-board')
  @Permissions(PERMISSION_SLUGS.JOURNAL_EDIT_METADATA)
  listBoard(@CurrentUser() user: RequestUser, @Param('slug') slug: string) {
    return this.board.listForStaff(user, slug);
  }

  @Post(':slug/editorial-board')
  @Permissions(PERMISSION_SLUGS.JOURNAL_EDIT_METADATA)
  addBoardMember(
    @CurrentUser() user: RequestUser,
    @Param('slug') slug: string,
    @Body() dto: EditorialBoardMemberDto,
  ) {
    return this.board.create(user, slug, dto);
  }

  @Put(':slug/editorial-board/order')
  @Permissions(PERMISSION_SLUGS.JOURNAL_EDIT_METADATA)
  reorderBoard(
    @CurrentUser() user: RequestUser,
    @Param('slug') slug: string,
    @Body() dto: ReorderEditorialBoardDto,
  ) {
    return this.board.reorder(user, slug, dto.ids);
  }

  @Patch(':slug/editorial-board/:id')
  @Permissions(PERMISSION_SLUGS.JOURNAL_EDIT_METADATA)
  updateBoardMember(
    @CurrentUser() user: RequestUser,
    @Param('slug') slug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditorialBoardMemberDto,
  ) {
    return this.board.update(user, slug, id, dto);
  }

  @Delete(':slug/editorial-board/:id')
  @Permissions(PERMISSION_SLUGS.JOURNAL_EDIT_METADATA)
  removeBoardMember(
    @CurrentUser() user: RequestUser,
    @Param('slug') slug: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.board.remove(user, slug, id);
  }
}
