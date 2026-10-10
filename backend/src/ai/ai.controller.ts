import { Body, Controller, Post, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { ChatMessageDto } from './ai.dto';
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}
  @Post('chat')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async chat(@Request() req: any, @Body() dto: ChatMessageDto, @Res({ passthrough: true }) res: Response) {
    const cancellation = new AbortController();
    const cancel = () => cancellation.abort();
    req.once('aborted', cancel);
    res.once('close', cancel);
    try {
      return await this.aiService.chat(req.user.id, dto, cancellation.signal);
    } finally {
      req.off('aborted', cancel);
      res.off('close', cancel);
    }
  }
}
