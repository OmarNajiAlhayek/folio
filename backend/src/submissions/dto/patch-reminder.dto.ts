import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

/** Reschedule a pending reminder; must be strictly after now + lead time (see RemindersService). */
export class PatchReminderDto {
  @ApiProperty({
    description:
      'When to send the reminder (ISO-8601, UTC/Z recommended). Must be at least ~2 minutes in the future.',
    example: '2026-05-15T12:00:00.000Z',
  })
  @IsISO8601({ strict: true })
  sendAt!: string;
}
