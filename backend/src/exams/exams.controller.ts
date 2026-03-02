import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ExamsService } from './exams.service';
import { CreateExamDto, UpdateExamDto, CreateQuestionDto, UpdateQuestionDto } from './dto/exam.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

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
    @CurrentUser('id') teacherId: string,
  ) {
    return this.examsService.create(courseId, dto, teacherId);
  }

  @Get()
  @ApiOperation({ summary: 'Курстың емтихандары' })
  findByCourse(@Param('courseId') courseId: string) {
    return this.examsService.findByCourse(courseId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Емтиханды ID бойынша алу' })
  findById(@Param('id') id: string) {
    return this.examsService.findById(id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Емтиханды жою' })
  remove(@Param('id') id: string, @CurrentUser('id') teacherId: string) {
    return this.examsService.remove(id, teacherId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Емтиханды жаңарту' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExamDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.examsService.update(id, dto, teacherId);
  }

  @Post(':id/questions')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Сұрақ қосу' })
  addQuestion(
    @Param('id') examId: string,
    @Body() dto: CreateQuestionDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.examsService.addQuestion(examId, dto, teacherId);
  }

  @Patch(':examId/questions/:questionId')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Сұрақты жаңарту' })
  updateQuestion(
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.examsService.updateQuestion(questionId, dto, teacherId);
  }

  @Delete(':examId/questions/:questionId')
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Сұрақты жою' })
  removeQuestion(
    @Param('questionId') questionId: string,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.examsService.removeQuestion(questionId, teacherId);
  }
}
