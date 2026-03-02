import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EvidenceService } from './evidence.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Дәлелдемелер')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PROCTOR, Role.ADMIN)
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Get(':attemptId')
  @ApiOperation({ summary: 'Талпыныстың дәлелдемелерін алу (проктор)' })
  getByAttempt(@Param('attemptId') attemptId: string) {
    return this.evidenceService.getEvidenceByAttempt(attemptId);
  }
}
