import { IsISO8601 } from 'class-validator';

export class PatchReminderDto {
  @IsISO8601()
  sendAt: string;
}
