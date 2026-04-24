import { Controller, Get, Param, Post, UseGuards, UseInterceptors, UploadedFile, Body, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { EvidenceService } from './evidence.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

const ALLOWED_MIME_TYPES = ['video/webm', 'video/mp4', 'video/ogg', 'video/x-matroska'];
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

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
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } }))
  async uploadRecording(
    @Param('attemptId') attemptId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: string,
  ) {
    if (!file) throw new BadRequestException('Файл жоқ');
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Рұқсат берілмеген файл түрі: ${file.mimetype}. Қолынды: ${ALLOWED_MIME_TYPES.join(', ')}`);
    }
    return this.evidenceService.saveRecording(
      attemptId,
      file.buffer,
      file.mimetype,
      (type === 'screen' ? 'screen' : 'camera') as 'camera' | 'screen',
    );
  }
}
