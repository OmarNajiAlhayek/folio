import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsISO8601,
  Max,
  Min,
} from 'class-validator';

export class PatchReminderPolicyDto {
  @ApiProperty({ minimum: 4, example: 21 })
  @IsInt()
  @Min(4)
  @Max(3650)
  reviewDueInDays: number;

  @ApiProperty({
    description:
      'Expected updated_at from GET (optimistic locking). Must match current row.',
  })
  @IsISO8601()
  expectedUpdatedAt: string;
}
