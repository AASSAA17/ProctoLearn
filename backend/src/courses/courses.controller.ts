import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role, CourseLevel } from '@prisma/client';

@ApiTags('Курстар')
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  @ApiBearerAuth()
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
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('level') level?: CourseLevel,
  ) {
    return this.coursesService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 100,
      level,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Курсты ID бойынша алу (жалпыға қолжетімді)' })
  findById(@Param('id') id: string) {
    return this.coursesService.findById(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Курсты жаңарту' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.coursesService.update(id, dto, teacherId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Курсты жою' })
  remove(@Param('id') id: string, @CurrentUser('id') teacherId: string) {
    return this.coursesService.remove(id, teacherId);
  }
}
