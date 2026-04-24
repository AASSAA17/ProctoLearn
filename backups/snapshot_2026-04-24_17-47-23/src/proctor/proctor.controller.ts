import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProctorService } from './proctor.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Прокторинг')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PROCTOR, Role.ADMIN)
@Controller('proctor')
export class ProctorController {
  constructor(private readonly proctorService: ProctorService) {}

  @Get('sessions/:attemptId')
  @ApiOperation({ summary: 'Сессия қысқаша мазмұны' })
  getSessionSummary(@Param('attemptId') attemptId: string) {
    return this.proctorService.getSessionSummary(attemptId);
  }
}
