import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiQuery } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role, CourseLevel } from '@prisma/client';
import { LessonViewer } from '../lessons/lesson-access';
@ApiTags('Курстар')
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Курс жасау (мұғалім)' })
  create(@Body() dto: CreateCourseDto, @CurrentUser('id') teacherId: string) {
    return this.coursesService.create(dto, teacherId);
  }

  @Get()
  @ApiOperation({ summary: 'Барлық курстар (жалпыға қолжетімді)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'level', required: false, enum: CourseLevel })
  @ApiQuery({ name: 'teacherId', required: false, type: String })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('level') level?: CourseLevel,
    @Query('teacherId') teacherId?: string,
  ) {
    return this.coursesService.findAll(
      Math.max(1, parseInt(page || '1', 10) || 1),
      Math.min(100, Math.max(1, parseInt(limit || '20', 10) || 20)),
      level,
      teacherId,
    );
  }

  @Get('manage')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Мұғалімнің курстары, соның ішінде жобалар мен мұрағат' })
  manage(@CurrentUser() viewer: LessonViewer, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.coursesService.findAll(Math.max(1, parseInt(page || '1', 10) || 1), Math.min(100, Math.max(1, parseInt(limit || '20', 10) || 20)), undefined, undefined, viewer);
  }

  @Get(':id/overview')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  overview(@Param('id') id: string, @CurrentUser() viewer: LessonViewer) {
    return this.coursesService.findById(id, viewer);
  }

  @Post(':id/publish')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  publish(@Param('id') id: string, @CurrentUser() viewer: LessonViewer) {
    return this.coursesService.publish(id, viewer);
  }

  @Post(':id/archive')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  archive(@Param('id') id: string, @CurrentUser() viewer: LessonViewer) {
    return this.coursesService.archive(id, viewer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Курсты ID бойынша алу (жалпыға қолжетімді)' })
  findById(@Param('id') id: string) {
    return this.coursesService.findById(id);
  }

  @Get(':id/material')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Курс материалдары (тіркелген студент немесе курс иесі)' })
  getMaterial(@Param('id') id: string, @CurrentUser() viewer: LessonViewer) {
    return this.coursesService.getMaterial(id, viewer);
  }

  @Patch(':id')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Курсты жаңарту' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser('id') teacherId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.coursesService.update(id, dto, teacherId, role);
  }

  @Delete(':id')
  @ApiCookieAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Курсты мұрағаттау (оқу тарихы сақталады)' })
  remove(
    @Param('id') id: string,
    @CurrentUser('id') teacherId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.coursesService.remove(id, teacherId, role);
  }
}
