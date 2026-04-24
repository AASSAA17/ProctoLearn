import { Controller, Get, Param, Patch, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService, UpdateProfileDto } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Пайдаланушылар')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.PROCTOR)
  @ApiOperation({ summary: 'Барлық пайдаланушылар тізімі' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.findAll(page ? parseInt(page) : 1, limit ? parseInt(limit) : 20);
  }

  @Get('me')
  @Roles(Role.STUDENT, Role.TEACHER, Role.PROCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Өз профилін алу' })
  getMe(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId);
  }

  @Patch('me/profile')
  @Roles(Role.STUDENT, Role.TEACHER, Role.PROCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Өз профилін жаңарту' })
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.PROCTOR)
  @ApiOperation({ summary: 'Пайдаланушыны ID бойынша алу (Admin/Proctor ғана)' })
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id/role')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Рөлді өзгерту (тек Admin)' })
  updateRole(@Param('id') id: string, @Body('role') role: Role) {
    return this.usersService.updateRole(id, role);
  }
}
