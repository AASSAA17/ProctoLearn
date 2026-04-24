import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
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
  chat(@Request() req: any, @Body() dto: ChatMessageDto) {
    return this.aiService.chat(req.user.id, dto);
  }
}
