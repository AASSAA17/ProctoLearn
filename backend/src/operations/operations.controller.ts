import { Controller, Get, Patch, Param, Query, UseGuards, Header, ParseUUIDPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OperationsService } from './operations.service';

class PageQuery {
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly operations: OperationsService) {}
  @Get() @Header('Cache-Control', 'no-store')
  list(@CurrentUser('id') userId: string, @Query() query: PageQuery) {
    return this.operations.notifications(userId, query.cursor, query.limit ?? 20);
  }
  @Patch(':id/read')
  read(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.operations.markRead(id, userId);
  }
}

@Controller('admin/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AuditController {
  constructor(private readonly operations: OperationsService) {}
  @Get() @Header('Cache-Control', 'no-store')
  list(@Query() query: PageQuery) { return this.operations.audit(query.cursor, query.limit ?? 50); }
}
