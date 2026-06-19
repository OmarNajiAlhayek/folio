import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { AuditActionType, AuditResourceType } from './audit-action';
import { AuditLogService } from './audit-log.service';

function parseIntParam(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

class AuditLogQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  startDate?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  routePattern?: string;

  @IsOptional()
  @IsEnum(AuditActionType)
  actionType?: string;

  @IsOptional()
  @IsEnum(AuditResourceType)
  resourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  resourceId?: string;

  @IsOptional()
  @Transform(({ value }) => parseIntParam(value, 1))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseIntParam(value, 20))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

@ApiTags('audit')
@Controller('audit')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@ApiBearerAuth('JWT')
export class AuditController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('logs')
  @Permissions(PERMISSION_SLUGS.AUDIT_LOG_VIEW)
  getLogs(@Query() query: AuditLogQueryDto) {
    return this.auditLogService.findAll(query);
  }
}
