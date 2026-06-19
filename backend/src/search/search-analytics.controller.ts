import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { randomUUID } from 'crypto';
import { SearchService } from './search.service';

class RecordClickDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  q: string;

  @IsUUID()
  docId: string;

  /**
   * An opaque client-side session ID for deduplication.
   * Generated server-side when omitted — no PII required.
   */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  userId?: string;
}

@ApiTags('public-search')
@Controller('public/search')
@Throttle({ public: {} })
export class SearchAnalyticsController {
  constructor(private readonly searchService: SearchService) {}

  @Post('click')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({ type: RecordClickDto })
  recordClick(@Body() body: RecordClickDto): void {
    if (!this.searchService.isEnabled()) return;
    const userId = body.userId ?? randomUUID();
    // Fire-and-forget: analytics failures must never affect the reader experience.
    void this.searchService
      .recordClickEvent(body.q, body.docId, userId)
      .catch(() => undefined);
  }
}
