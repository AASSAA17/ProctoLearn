import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/lesson.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Сабақтар')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('courses/:courseId/lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Сабақ жасау' })
  create(
    @Param('courseId') courseId: string,
    @Body() dto: CreateLessonDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.lessonsService.create(courseId, dto, teacherId);
  }

  @Get()
  @ApiOperation({ summary: 'Курстың барлық сабақтары' })
  findByCourse(@Param('courseId') courseId: string) {
    return this.lessonsService.findByCourse(courseId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Сабақты ID бойынша алу' })
  findById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.lessonsService.findById(id, userId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Сабақты жаңарту' })
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateLessonDto>,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.lessonsService.update(id, dto, teacherId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Сабақты жою' })
  remove(@Param('id') id: string, @CurrentUser('id') teacherId: string) {
    return this.lessonsService.remove(id, teacherId);
  }
}
