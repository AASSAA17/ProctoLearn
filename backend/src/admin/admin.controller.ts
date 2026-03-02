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
  getUsers(@Query('search') search?: string) {
    return this.adminService.getUsers(search);
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

  @Post('users/:id/reset-password')
  @ApiOperation({ summary: 'Уақытша пароль жіберу' })
  resetPassword(@Param('id') id: string) {
    return this.adminService.resetUserPassword(id);
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
