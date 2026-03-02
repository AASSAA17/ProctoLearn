import { Controller, Get, Param, Post, UseGuards, UseInterceptors, UploadedFile, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { EvidenceService } from './evidence.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Дәлелдемелер')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Get(':attemptId')
  @UseGuards(RolesGuard)
  @Roles(Role.PROCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Талпыныстың дәлелдемелерін алу (проктор/админ)' })
  getByAttempt(@Param('attemptId') attemptId: string) {
    return this.evidenceService.getEvidenceByAttempt(attemptId);
  }

  @Post(':attemptId/recording')
  @ApiOperation({ summary: 'Видео жазбаны жүктеп салу (студент)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }))
  async uploadRecording(
    @Param('attemptId') attemptId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: string,
  ) {
    return this.evidenceService.saveRecording(
      attemptId,
      file.buffer,
      file.mimetype,
      (type === 'screen' ? 'screen' : 'camera') as 'camera' | 'screen',
    );
  }
}
