import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class UpdateUserRolesDto {
  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleSlugs: string[];
}
