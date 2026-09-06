import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateReviewFileReleaseDto {
  @ApiProperty({
    description:
      'true releases this reviewer review file to the author; false revokes it.',
  })
  @IsBoolean()
  released: boolean;
}
