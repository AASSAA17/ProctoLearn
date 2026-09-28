import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { HealthService } from './health.service';

@Controller()
@SkipThrottle()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('health')
  live(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    const result = await this.health.readiness();
    response.setHeader('Cache-Control', 'no-store');
    response.status(result.status === 'ready' ? 200 : 503);
    return result;
  }
}
