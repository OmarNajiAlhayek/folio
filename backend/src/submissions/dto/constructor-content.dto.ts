import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Class-validator only checks the top-level shape (`defaultDir` + array of objects).
 * The section discriminated union is validated structurally by
 * `validateConstructorContentForSubmit()` at submit time and parsed
 * to the strongly-typed `ConstructorContent` before reaching the generator.
 *
 * Sections are intentionally NOT validated with @ValidateNested so that the
 * global ValidationPipe's `forbidNonWhitelisted` option does not reject the
 * per-kind payload fields (text, lang, authors, items, pinned, etc.) that have
 * no class-validator decorator.
 */
export class ConstructorContentDto {
  @ApiProperty({ enum: ['ltr', 'rtl'] })
  @IsIn(['ltr', 'rtl'])
  defaultDir: 'ltr' | 'rtl';

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Constructor sections (discriminated by kind).',
  })
  @IsArray()
  sections: Record<string, unknown>[];
}

/** Body of `POST /submissions/:slug/generate-docx`. */
export class GenerateDocxDto {
  @ApiProperty({ type: () => ConstructorContentDto })
  @IsObject()
  @ValidateNested()
  @Type(() => ConstructorContentDto)
  content: ConstructorContentDto;

  /**
   * When true, the generated `.docx` is stored as the submission's
   * `kind=manuscript` file (replacing any existing one) and the
   * response is the new file row instead of the binary stream.
   */
  @ApiPropertyOptional({
    description:
      'When true, store as manuscript file instead of streaming download.',
  })
  @IsOptional()
  @IsBoolean()
  attach?: boolean;
}
