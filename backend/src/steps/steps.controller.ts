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

@ApiTags('Қадамдар')
@Controller()
export class StepsController {
  constructor(private readonly stepsService: StepsService) {}

  @Post('lessons/:lessonId/steps')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Сабаққа қадам қосу' })
  create(
    @Param('lessonId') lessonId: string,
    @Body() dto: CreateStepDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.stepsService.create(lessonId, dto, teacherId);
  }

  @Get('lessons/:lessonId/steps')
  @ApiOperation({ summary: 'Сабақтың барлық қадамдары' })
  findByLesson(@Param('lessonId') lessonId: string) {
    return this.stepsService.findByLesson(lessonId);
  }

  @Get('steps/:id')
  @ApiOperation({ summary: 'Қадамды алу' })
  findById(@Param('id') id: string) {
    return this.stepsService.findById(id);
  }

  @Patch('steps/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Қадамды жаңарту' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStepDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.stepsService.update(id, dto, teacherId);
  }

  @Delete('steps/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Қадамды жою' })
  remove(@Param('id') id: string, @CurrentUser('id') teacherId: string) {
    return this.stepsService.remove(id, teacherId);
  }

  @Post('steps/:id/submit')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Жауапты тапсыру (автотексеру)' })
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitAnswerDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.stepsService.submitAnswer(id, userId, dto);
  }
}
