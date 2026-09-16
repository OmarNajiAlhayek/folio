import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  EDITORIAL_BOARD_ROLES,
  type EditorialBoardRole,
} from '../../entities/editorial-board-member.entity';

/**
 * Creates a board member, or partially updates one (omitted fields are left
 * alone). Only shape is checked here: a name in at least one language, a role
 * and a valid ORCID iD are required of the *resulting* record, which
 * `EditorialBoardService` checks so create and update share one rule set.
 */
export class EditorialBoardMemberDto {
  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string | null;

  @ApiPropertyOptional({ maxLength: 200, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string | null;

  @ApiPropertyOptional({ enum: EDITORIAL_BOARD_ROLES })
  @IsOptional()
  @IsIn([...EDITORIAL_BOARD_ROLES])
  role?: EditorialBoardRole;

  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  affiliationAr?: string | null;

  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  affiliationEn?: string | null;

  @ApiPropertyOptional({ example: '0000-0002-1825-0097', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  orcid?: string | null;
}

/** Every member of the board, by id, in the new order. */
export class ReorderEditorialBoardDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids: string[];
}
