import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConstructorContentDto } from './constructor-content.dto';

/**
 * Optional body for `POST /submissions/:slug/submit`.
 * When present, `constructorContent` is used to validate and build the
 * manuscript `.docx` so submit reflects the latest editor state (same as
 * `generate-docx`), not only the last debounced PATCH in the DB.
 */
export class SubmitSubmissionDto {
  @ApiPropertyOptional({ type: () => ConstructorContentDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ConstructorContentDto)
  constructorContent?: ConstructorContentDto;

  /**
   * @deprecated Prefer `presentUploadedManuscript` / `presentConstructorManuscript`.
   * When true, only the uploaded `manuscript` file is presented (legacy radio "upload").
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  useUploadedManuscript?: boolean;

  /** Include uploaded main manuscript (`kind=manuscript`) in the review package. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  presentUploadedManuscript?: boolean;

  /** Include constructor-generated main manuscript in the review package. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  presentConstructorManuscript?: boolean;
}
