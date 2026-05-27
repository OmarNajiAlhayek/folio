import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { skipAllThrottles } from '../common/throttle-profiles';

@ApiTags('health')
@Controller('health')
@SkipThrottle(skipAllThrottles())
export class HealthController {
  @Get()
  ok() {
    return { status: 'ok', service: 'folio-api' };
  }
}
