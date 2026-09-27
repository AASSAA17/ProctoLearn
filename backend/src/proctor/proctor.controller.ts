import { Controller, Get, Put, Delete, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProctorService } from './proctor.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Actor } from './proctor-access';
import { ReviewAttemptDto } from './proctor.dto';

@ApiTags('Прокторинг')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PROCTOR, Role.ADMIN)
@Controller('proctor')
export class ProctorController {
  constructor(private readonly proctorService: ProctorService) {}

  @Get('sessions/:attemptId')
  @ApiOperation({ summary: 'Сессия қысқаша мазмұны' })
  getSessionSummary(@Param('attemptId') attemptId: string, @CurrentUser() actor: Actor) {
    return this.proctorService.getSessionSummary(attemptId, actor);
  }

  @Post('sessions/:attemptId/review')
  @ApiOperation({ summary: 'Аяқталған емтиханды дәлелдемелер бойынша тексеру' })
  review(@Param('attemptId') attemptId: string, @CurrentUser() actor: Actor, @Body() dto: ReviewAttemptDto) {
    return this.proctorService.reviewAttempt(attemptId, actor, dto);
  }

  @Get('exams/:examId/assignments')
  @Roles(Role.TEACHER, Role.ADMIN)
  listAssignments(@Param('examId') examId: string, @CurrentUser() actor: Actor) {
    return this.proctorService.listAssignments(examId, actor);
  }

  @Get('exams/:examId/candidates')
  @Roles(Role.TEACHER, Role.ADMIN)
  listCandidates(@Param('examId') examId: string, @CurrentUser() actor: Actor) {
    return this.proctorService.listCandidates(examId, actor);
  }

  @Put('exams/:examId/assignments/:proctorId')
  @Roles(Role.TEACHER, Role.ADMIN)
  assign(@Param('examId') examId: string, @Param('proctorId') proctorId: string, @CurrentUser() actor: Actor) {
    return this.proctorService.assign(examId, proctorId, actor);
  }

  @Delete('exams/:examId/assignments/:proctorId')
  @Roles(Role.TEACHER, Role.ADMIN)
  unassign(@Param('examId') examId: string, @Param('proctorId') proctorId: string, @CurrentUser() actor: Actor) {
    return this.proctorService.unassign(examId, proctorId, actor);
  }
}
