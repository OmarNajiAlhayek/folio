import { IsIn, IsOptional, ValidateIf } from 'class-validator';

export class PatchMeDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(['en', 'ar'])
  preferredLocale?: 'en' | 'ar' | null;
}
