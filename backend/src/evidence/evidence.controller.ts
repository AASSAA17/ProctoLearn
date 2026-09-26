import { Controller, Get, Param, Post, UseGuards, UseInterceptors, UploadedFile, Body, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { EvidenceService } from './evidence.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RecordingOwnerGuard } from './recording-owner.guard';

const ALLOWED_MIME_TYPES = ['video/webm', 'video/mp4', 'video/ogg', 'video/x-matroska'];
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
const RECORDING_DIRECTORY = join(tmpdir(), 'proctolearn-recordings');
mkdirSync(RECORDING_DIRECTORY, { recursive: true, mode: 0o700 });

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
  @UseGuards(RecordingOwnerGuard)
  @ApiOperation({ summary: 'Видео жазбаны жүктеп салу (студент)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({ destination: RECORDING_DIRECTORY }),
    // Busboy emits partsLimit at the closing boundary; allow that boundary too.
    limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 1, fieldSize: 32, parts: 3 },
    fileFilter: (_req, file, callback) => {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) return callback(new BadRequestException('Видео түрі жарамсыз'), false);
      callback(null, true);
    },
  }))
  async uploadRecording(
    @Param('attemptId') attemptId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: string,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) throw new BadRequestException('Файл жоқ');
    try {
      if (!['camera', 'screen'].includes(type)) throw new BadRequestException('Жазба түрі жарамсыз');
      return await this.evidenceService.saveRecording(attemptId, file.path, file.mimetype, type as 'camera' | 'screen', userId);
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }
}
