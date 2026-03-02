import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ExamsService } from './exams.service';
import { CreateExamDto } from './dto/exam.dto';
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
}
