import {
  Controller, Get, Post, Delete, Param, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth } from '@nestjs/swagger';
import { EnrollmentsService } from './enrollments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Тіркелулер')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post('courses/:courseId')
  @ApiOperation({ summary: 'Курсқа тіркелу' })
  enroll(
    @CurrentUser('id') userId: string,
    @Param('courseId') courseId: string,
  ) {
    return this.enrollmentsService.enroll(userId, courseId);
  }

  @Get('my')
  @ApiOperation({ summary: 'Менің тіркелулерім' })
  getMyEnrollments(@CurrentUser('id') userId: string) {
    return this.enrollmentsService.getMyEnrollments(userId);
  }

  @Get('active')
  @ApiOperation({ summary: 'Белсенді тіркелу' })
  getActiveEnrollment(@CurrentUser('id') userId: string) {
    return this.enrollmentsService.getActiveEnrollment(userId);
  }

  @Get('check/:courseId')
  @ApiOperation({ summary: 'Курсқа тіркелу мәртебесі' })
  checkEnrollment(
    @CurrentUser('id') userId: string,
    @Param('courseId') courseId: string,
  ) {
    return this.enrollmentsService.checkEnrollment(userId, courseId);
  }

  @Post('complete/:courseId')
  @ApiOperation({ summary: 'Курсты аяқтандыру' })
  completeEnrollment(
    @CurrentUser('id') userId: string,
    @Param('courseId') courseId: string,
  ) {
    return this.enrollmentsService.completeEnrollment(userId, courseId);
  }

  @Delete('courses/:courseId')
  @ApiOperation({ summary: 'Курстан шығу' })
  unenroll(
    @CurrentUser('id') userId: string,
    @Param('courseId') courseId: string,
  ) {
    return this.enrollmentsService.unenroll(userId, courseId);
  }
}
