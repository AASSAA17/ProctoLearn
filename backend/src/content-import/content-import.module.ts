import { Module, Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StepsService } from '../steps/steps.service';
import { ContentImportService } from './content-import.service';
import { ImportDraftDto } from './content-import.dto';

@Controller('content-import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.TEACHER)
class ContentImportController {
  constructor(private service: ContentImportService) {}
  @Post('draft')
  draft(@Body() input: ImportDraftDto, @CurrentUser() viewer: { id: string; role: string }) {
    return this.service.importDraft(input, viewer);
  }
}
@Module({ controllers: [ContentImportController], providers: [ContentImportService, StepsService] })
export class ContentImportModule {}
