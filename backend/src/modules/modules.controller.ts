import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ModulesService } from './modules.service';
import { CreateModuleDto, UpdateModuleDto, ReorderModuleDto } from './dto/module.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Курс бөлімдері')
@Controller()
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Post('courses/:courseId/modules')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Бөлім жасау' })
  create(
    @Param('courseId') courseId: string,
    @Body() dto: CreateModuleDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.modulesService.create(courseId, dto, teacherId);
  }

  @Get('courses/:courseId/modules')
  @ApiOperation({ summary: 'Курстың барлық бөлімдері' })
  findByCourse(@Param('courseId') courseId: string) {
    return this.modulesService.findByCourse(courseId);
  }

  @Get('modules/:id')
  @ApiOperation({ summary: 'Бөлімді алу' })
  findById(@Param('id') id: string) {
    return this.modulesService.findById(id);
  }

  @Patch('modules/reorder')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Бөлімдерді қайта реттеу' })
  reorder(@Body() dto: ReorderModuleDto, @CurrentUser('id') teacherId: string) {
    return this.modulesService.reorder(dto, teacherId);
  }

  @Patch('modules/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Бөлімді жаңарту' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateModuleDto,
    @CurrentUser('id') teacherId: string,
  ) {
    return this.modulesService.update(id, dto, teacherId);
  }

  @Delete('modules/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @ApiOperation({ summary: 'Бөлімді жою' })
  remove(@Param('id') id: string, @CurrentUser('id') teacherId: string) {
    return this.modulesService.remove(id, teacherId);
  }
}
