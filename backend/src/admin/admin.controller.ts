import {
  Controller, Get, Post, Param, Query, Res, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Админ панелі')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Жалпы статистика' })
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('courses/stats')
  @ApiOperation({ summary: 'Курстар статистикасы' })
  getCourseStats() {
    return this.adminService.getCourseStats();
  }

  @Get('users')
  @ApiOperation({ summary: 'Барлық пайдаланушылар (іздеу қолдауымен)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 50, max: 200)' })
  getUsers(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit || '50', 10) || 50));
    return this.adminService.getUsers(search, pageNum, limitNum);
  }

  @Get('users/online')
  @ApiOperation({ summary: 'Қазіргі онлайн пайдаланушылар' })
  getOnlineUsers() {
    return this.adminService.getOnlineUsers();
  }

  @Get('users/:id/progress')
  @ApiOperation({ summary: 'Пайдаланушының курс барысы' })
  getUserProgress(@Param('id') id: string) {
    return this.adminService.getUserCourseProgress(id);
  }

  @Post('users/:userId/reset-password')
  @ApiOperation({ summary: 'Уақытша пароль жіберу' })
  resetPassword(@Param('userId') id: string) {
    return this.adminService.resetUserPassword(id);
  }

  @Post('users/:userId/grant-certificate/:courseId')
  @ApiOperation({ summary: 'Пайдаланушыға курсты өткізіп сертификат беру' })
  grantCertificate(
    @Param('userId') userId: string,
    @Param('courseId') courseId: string,
  ) {
    return this.adminService.grantFullCertificate(userId, courseId);
  }

  @Post('users/:userId/grant-exam-access/:courseId')
  @ApiOperation({ summary: 'Пайдаланушыға тікелей экзаменге кіру рұқсатын беру' })
  grantExamAccess(
    @Param('userId') userId: string,
    @Param('courseId') courseId: string,
  ) {
    return this.adminService.grantExamAccess(userId, courseId);
  }

  @Get('export/users')
  @ApiOperation({ summary: 'Пайдаланушылар Excel есебі' })
  async exportUsers(@Res() res: Response) {
    const buffer = await this.adminService.exportUsersExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="users.xlsx"');
    res.send(buffer);
  }

  @Get('export/courses')
  @ApiOperation({ summary: 'Курстар Excel есебі' })
  async exportCourses(@Res() res: Response) {
    const buffer = await this.adminService.exportCoursesExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="courses.xlsx"');
    res.send(buffer);
  }
}
