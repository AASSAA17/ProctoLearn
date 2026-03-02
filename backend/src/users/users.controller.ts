import { Controller, Get, Param, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
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
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Пайдаланушыны ID бойынша алу' })
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
