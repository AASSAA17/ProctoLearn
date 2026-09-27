import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ExamsService } from './exams.service';
import { CreateExamDto, UpdateExamDto, CreateQuestionDto, UpdateQuestionDto } from './dto/exam.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { LessonViewer } from '../lessons/lesson-access';

@ApiTags('Емтихандар')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('courses/:courseId/exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Емтихан жасау (мұғалім)' })
  create(
    @Param('courseId') courseId: string,
    @Body() dto: CreateExamDto,
    @CurrentUser() viewer: LessonViewer,
  ) {
    return this.examsService.create(courseId, dto, viewer);
  }

  @Get()
  @ApiOperation({ summary: 'Курстың емтихандары' })
  findByCourse(@Param('courseId') courseId: string, @CurrentUser() viewer: LessonViewer) {
    return this.examsService.findByCourse(courseId, viewer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Емтиханды ID бойынша алу' })
  findById(@Param('courseId') courseId: string, @Param('id') id: string, @CurrentUser() viewer: LessonViewer) {
    return this.examsService.findById(courseId, id, viewer);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Емтиханды жою' })
  remove(@Param('courseId') courseId: string, @Param('id') id: string, @CurrentUser() viewer: LessonViewer) {
    return this.examsService.remove(courseId, id, viewer);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Емтиханды жаңарту' })
  update(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Body() dto: UpdateExamDto,
    @CurrentUser() viewer: LessonViewer,
  ) {
    return this.examsService.update(courseId, id, dto, viewer);
  }

  @Post(':id/questions')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Сұрақ қосу' })
  addQuestion(
    @Param('courseId') courseId: string,
    @Param('id') examId: string,
    @Body() dto: CreateQuestionDto,
    @CurrentUser() viewer: LessonViewer,
  ) {
    return this.examsService.addQuestion(courseId, examId, dto, viewer);
  }

  @Patch(':examId/questions/:questionId')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Сұрақты жаңарту' })
  updateQuestion(
    @Param('courseId') courseId: string,
    @Param('examId') examId: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() viewer: LessonViewer,
  ) {
    return this.examsService.updateQuestion(courseId, examId, questionId, dto, viewer);
  }

  @Delete(':examId/questions/:questionId')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Сұрақты жою' })
  removeQuestion(
    @Param('courseId') courseId: string,
    @Param('examId') examId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() viewer: LessonViewer,
  ) {
    return this.examsService.removeQuestion(courseId, examId, questionId, viewer);
  }
}
