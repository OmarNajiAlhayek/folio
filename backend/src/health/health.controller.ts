import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  @Get()
  ok() {
    return { status: 'ok', service: 'folio-api' };
  }
}
