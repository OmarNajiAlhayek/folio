import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';

/**
 * Send either `roleSlugs` (replace the whole set) or `add` / `remove`
 * (change single roles against what the user holds right now — what the
 * admin screen uses, so a stale page cannot undo someone else's change).
 */
export class UpdateUserRolesDto {
  @ApiPropertyOptional({ type: [String], minItems: 1 })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleSlugs?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  add?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  remove?: string[];
}
