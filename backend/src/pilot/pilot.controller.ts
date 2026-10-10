import { Body, Controller, Get, Header, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { CreatePilotInvitationDto, SuspendPilotMemberDto } from './pilot.dto';
import { PilotService } from './pilot.service';

@Controller('pilot')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PilotController {
  constructor(private readonly pilot: PilotService, private readonly enrollments: EnrollmentsService) {}

  @Post('invitations')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  createInvitation(@Body() dto: CreatePilotInvitationDto, @CurrentUser('id') actorId: string) {
    return this.pilot.createInvitation(dto.email, dto.expiresInHours, actorId);
  }

  @Post('invitations/:id/revoke')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  revokeInvitation(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.pilot.revokeInvitation(id, actorId);
  }

  @Get('overview')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  overview() { return this.pilot.overview(); }

  @Get('members/:userId/progress')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  progress(@Param('userId') userId: string) { return this.pilot.memberProgress(userId); }

  @Post('members/:userId/suspend')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  suspend(@Param('userId') userId: string, @Body() dto: SuspendPilotMemberDto, @CurrentUser('id') actorId: string) {
    return this.pilot.suspendMember(userId, dto.reason, actorId);
  }

  @Post('members/:userId/resume')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  resume(@Param('userId') userId: string, @CurrentUser('id') actorId: string) {
    return this.pilot.resumeMember(userId, actorId);
  }

  @Post('members/:userId/courses/:courseId/withdraw')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  withdrawCourse(
    @Param('userId') userId: string,
    @Param('courseId') courseId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.enrollments.withdrawByStaff(actorId, userId, courseId);
  }
}
