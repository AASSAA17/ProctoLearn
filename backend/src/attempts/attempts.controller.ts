import { Controller, Get, Post, Param, Body, Query, UseGuards, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AttemptsService } from './attempts.service';
import { SubmitAnswersDto } from './dto/attempt.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Талпынулар')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attempts')
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  @Post('start/:examId')
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
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 50, max: 200)' })
  @ApiOperation({ summary: 'Барлық талпынулар (проктор/мұғалім)' })
  getAll(
    @Query('examId') examId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit || '50', 10) || 50));
    return this.attemptsService.getAllAttempts(examId, pageNum, limitNum);
  }

  @Patch(':id/flag')
  @UseGuards(RolesGuard)
  @Roles(Role.PROCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Талпынуды белгілеу' })
  flag(@Param('id') id: string) {
    return this.attemptsService.flagAttempt(id);
  }

  @Get('exam/:examId/results')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Емтихан нәтижелері (мұғалім)' })
  getByExam(@Param('examId') examId: string, @CurrentUser('id') teacherId: string) {
    return this.attemptsService.getAttemptsByExam(examId, teacherId);
  }
}
