import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubmissionsService } from './step-submissions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Жауаптар')
@Controller()
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Get('submissions/step/:stepId')
  @ApiOperation({ summary: 'Қадам бойынша менің жауаптарым' })
  getByStep(@Param('stepId') stepId: string, @CurrentUser('id') userId: string) {
    return this.submissionsService.getByStep(stepId, userId);
  }

  @Get('submissions/lesson/:lessonId/progress')
  @ApiOperation({ summary: 'Сабақтың прогресі' })
  getLessonProgress(
    @Param('lessonId') lessonId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.submissionsService.getLessonProgress(lessonId, userId);
  }

  @Get('submissions/course/:courseId/progress')
  @ApiOperation({ summary: 'Курстың жалпы прогресі' })
  getCourseProgress(
    @Param('courseId') courseId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.submissionsService.getCourseProgress(courseId, userId);
  }
}
