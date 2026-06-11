import { IsInt, IsISO8601, Max, Min } from 'class-validator';

export class PatchReminderPolicyDto {
  @IsInt()
  @Min(4)
  @Max(3650)
  reviewDueInDays: number;

  @IsISO8601()
  expectedUpdatedAt: string;
}
