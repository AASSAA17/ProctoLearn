import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StepsService } from './steps.service';
import { CreateStepDto, UpdateStepDto, SubmitAnswerDto } from './dto/step.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { LessonViewer } from '../lessons/lesson-access';

@ApiTags('Қадамдар')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class StepsController {
  constructor(private readonly stepsService: StepsService) {}

  @Post('lessons/:lessonId/steps')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Сабаққа қадам қосу' })
  create(
    @Param('lessonId') lessonId: string,
    @Body() dto: CreateStepDto,
    @CurrentUser() viewer: LessonViewer,
  ) {
    return this.stepsService.create(lessonId, dto, viewer);
  }

  @Get('lessons/:lessonId/steps')
  @ApiOperation({ summary: 'Сабақтың барлық қадамдары' })
  findByLesson(@Param('lessonId') lessonId: string, @CurrentUser() viewer: LessonViewer) {
    return this.stepsService.findByLesson(lessonId, viewer);
  }

  @Get('steps/:id')
  @ApiOperation({ summary: 'Қадамды алу' })
  findById(@Param('id') id: string, @CurrentUser() viewer: LessonViewer) {
    return this.stepsService.findById(id, viewer);
  }

  @Patch('steps/:id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Қадамды жаңарту' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStepDto,
    @CurrentUser() viewer: LessonViewer,
  ) {
    return this.stepsService.update(id, dto, viewer);
  }

  @Delete('steps/:id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Қадамды жою' })
  remove(@Param('id') id: string, @CurrentUser() viewer: LessonViewer) {
    return this.stepsService.remove(id, viewer);
  }

  @Post('steps/:id/submit')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Жауапты тапсыру (автотексеру)' })
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitAnswerDto,
    @CurrentUser() viewer: LessonViewer,
  ) {
    return this.stepsService.submitAnswer(id, viewer, dto);
  }

  @Post('steps/:id/complete')
  @ApiOperation({ summary: 'Оқылған мәтінді немесе қаралған бейнені белгілеу' })
  complete(@Param('id') id: string, @CurrentUser() viewer: LessonViewer) {
    return this.stepsService.markCompleted(id, viewer);
  }
}
