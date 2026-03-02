import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Курстар')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Курс жасау (мұғалім)' })
  create(@Body() dto: CreateCourseDto, @CurrentUser('id') teacherId: string) {
    return this.coursesService.create(dto, teacherId);
  }

  @Get()
  @ApiOperation({ summary: 'Барлық курстар' })
  findAll() {
    return this.coursesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Курсты ID бойынша алу' })
  findById(@Param('id') id: string) {
    return this.coursesService.findById(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
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
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Курсты жою' })
  remove(@Param('id') id: string, @CurrentUser('id') teacherId: string) {
    return this.coursesService.remove(id, teacherId);
  }
}
