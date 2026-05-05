import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignReviewerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  reviewerId: string;
}
