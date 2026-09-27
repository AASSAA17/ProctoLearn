import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LessonsService } from './lessons.service';
import { CreateLessonDto, UpdateLessonDto } from './dto/lesson.dto';
import { LessonViewer } from './lesson-access';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

class CheckAssignmentDto {
  @IsString() @IsNotEmpty() @MaxLength(10000)
  answer: string;
}

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
  create(@Param('courseId') courseId: string, @Body() dto: CreateLessonDto, @CurrentUser() viewer: LessonViewer) {
    return this.lessonsService.create(courseId, dto, viewer);
  }

  @Get()
  @ApiOperation({ summary: 'Курстың барлық сабақтары' })
  findByCourse(@Param('courseId') courseId: string, @CurrentUser() viewer: LessonViewer) {
    return this.lessonsService.findByCourse(courseId, viewer);
  }

  @Get('progress/my')
  @ApiOperation({ summary: 'Менің прогресім (курс бойынша)' })
  getMyProgress(@Param('courseId') courseId: string, @CurrentUser('id') userId: string) {
    return this.lessonsService.getMyProgress(courseId, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Сабақты ID бойынша алу' })
  findById(@Param('courseId') courseId: string, @Param('id') id: string, @CurrentUser() viewer: LessonViewer) {
    return this.lessonsService.findById(id, viewer, courseId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Сабақты жаңарту' })
  update(@Param('courseId') courseId: string, @Param('id') id: string, @Body() dto: UpdateLessonDto, @CurrentUser() viewer: LessonViewer) {
    return this.lessonsService.update(id, dto, viewer, courseId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Сабақты жою' })
  remove(@Param('courseId') courseId: string, @Param('id') id: string, @CurrentUser() viewer: LessonViewer) {
    return this.lessonsService.remove(id, viewer, courseId);
  }

  @Post(':id/check-assignment')
  @ApiOperation({ summary: 'Тапсырма жауабын тексеру' })
  checkAssignment(@Param('courseId') courseId: string, @Param('id') lessonId: string, @CurrentUser() viewer: LessonViewer, @Body() dto: CheckAssignmentDto) {
    return this.lessonsService.checkAssignment(lessonId, viewer, dto.answer, courseId);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Сабақты аяқтандыру (оқу сабақтары үшін)' })
  markCompleted(@Param('courseId') courseId: string, @Param('id') lessonId: string, @CurrentUser() viewer: LessonViewer) {
    return this.lessonsService.markCompleted(lessonId, viewer, courseId);
  }
}

@ApiTags('Сабақтар')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('modules/:moduleId/lessons')
export class ModuleLessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Бөлімге сабақ қосу' })
  create(@Param('moduleId') moduleId: string, @Body() dto: CreateLessonDto, @CurrentUser() viewer: LessonViewer) {
    return this.lessonsService.createForModule(moduleId, dto, viewer);
  }

  @Get()
  @ApiOperation({ summary: 'Бөлімнің барлық сабақтары' })
  findByModule(@Param('moduleId') moduleId: string, @CurrentUser() viewer: LessonViewer) {
    return this.lessonsService.findByModule(moduleId, viewer);
  }
}

@ApiTags('Сабақтар')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('lessons')
export class StandaloneLessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Сабақты ID бойынша алу (модуль сабақтары үшін)' })
  findById(@Param('id') id: string, @CurrentUser() viewer: LessonViewer) {
    return this.lessonsService.findById(id, viewer);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Сабақты жаңарту' })
  update(@Param('id') id: string, @Body() dto: UpdateLessonDto, @CurrentUser() viewer: LessonViewer) {
    return this.lessonsService.update(id, dto, viewer);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Сабақты жою' })
  remove(@Param('id') id: string, @CurrentUser() viewer: LessonViewer) {
    return this.lessonsService.remove(id, viewer);
  }
}
