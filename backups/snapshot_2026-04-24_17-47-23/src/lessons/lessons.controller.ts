import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/lesson.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { IsString, IsNotEmpty } from 'class-validator';

class CheckAssignmentDto {
  @IsString() @IsNotEmpty()
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

  @Get('progress/my')
  @ApiOperation({ summary: 'Менің прогресім (курс бойынша)' })
  getMyProgress(@Param('courseId') courseId: string, @CurrentUser('id') userId: string) {
    return this.lessonsService.getMyProgress(courseId, userId);
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

  @Post(':id/check-assignment')
  @ApiOperation({ summary: 'Тапсырма жауабын тексеру' })
  checkAssignment(
    @Param('id') lessonId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CheckAssignmentDto,
  ) {
    return this.lessonsService.checkAssignment(lessonId, userId, dto.answer);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Сабақты аяқтандыру (оқу сабақтары үшін)' })
  markCompleted(@Param('id') lessonId: string, @CurrentUser('id') userId: string) {
    return this.lessonsService.markCompleted(lessonId, userId);
  }
}

// ─── Module-based lessons ────────────────────────────────────────────────────
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
  create(
    @Param('moduleId') moduleId: string,
    @Body() dto: CreateLessonDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.lessonsService.createForModule(moduleId, dto, teacherId);
  }

  @Get()
  @ApiOperation({ summary: 'Бөлімнің барлық сабақтары' })
  findByModule(@Param('moduleId') moduleId: string) {
    return this.lessonsService.findByModule(moduleId);
  }
}

// ─── Standalone lesson routes (no courseId prefix) ────────────────────────────
@ApiTags('Сабақтар')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('lessons')
export class StandaloneLessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Сабақты ID бойынша алу (модуль сабақтары үшін)' })
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
