import { Controller, Get, Post, Param, Body, Query, UseGuards, Patch, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AttemptsService } from './attempts.service';
import { SaveDraftDto, SubmitAnswersDto } from './dto/attempt.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { Actor } from '../proctor/proctor-access';

@ApiTags('Талпынулар')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('attempts')
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  @Get('preflight/:examId')
  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Header('Cache-Control', 'no-store')
  preflight(@Param('examId') examId: string, @CurrentUser('id') userId: string) {
    return this.attemptsService.preflight(examId, userId);
  }

  @Post('start/:examId')
  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Емтиханды бастау (студент)' })
  start(@Param('examId') examId: string, @CurrentUser('id') userId: string) {
    return this.attemptsService.startAttempt(examId, userId);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Жауаптарды жіберу' })
  submit(
    @Param('id') attemptId: string,
    @Body() dto: SubmitAnswersDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.attemptsService.submitAnswers(attemptId, dto, userId);
  }

  @Get(':id/draft')
  getDraft(@Param('id') attemptId: string, @CurrentUser('id') userId: string) {
    return this.attemptsService.getDraft(attemptId, userId);
  }

  @Patch(':id/draft')
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  saveDraft(@Param('id') attemptId: string, @Body() dto: SaveDraftDto, @CurrentUser('id') userId: string) {
    return this.attemptsService.saveDraft(attemptId, dto, userId);
  }

  @Get('my')
  @ApiOperation({ summary: 'Менің талпынуларым' })
  myAttempts(@CurrentUser('id') userId: string) {
    return this.attemptsService.getUserAttempts(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Талпынуды алу' })
  getAttempt(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.attemptsService.getAttempt(id, userId);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.PROCTOR, Role.ADMIN, Role.TEACHER)
  @ApiQuery({ name: 'examId', required: false })
  @ApiQuery({ name: 'appealState', required: false, enum: ['OPEN'] })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 50, max: 200)' })
  @ApiOperation({ summary: 'Барлық талпынулар (проктор/мұғалім)' })
  getAll(
    @CurrentUser() actor: Actor,
    @Query('examId') examId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('appealState') appealState?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit || '50', 10) || 50));
    return this.attemptsService.getAllAttempts(actor, examId, pageNum, limitNum, appealState);
  }

  @Patch(':id/flag')
  @UseGuards(RolesGuard)
  @Roles(Role.PROCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Талпынуды белгілеу' })
  flag(@Param('id') id: string, @CurrentUser() actor: Actor) {
    return this.attemptsService.flagAttempt(id, actor);
  }

  @Get('exam/:examId/results')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Емтихан нәтижелері (мұғалім)' })
  getByExam(@Param('examId') examId: string, @CurrentUser() actor: Actor) {
    return this.attemptsService.getAttemptsByExam(examId, actor.id, actor.role);
  }
}
