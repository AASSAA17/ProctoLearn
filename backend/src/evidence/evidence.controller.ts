import { Controller, Get, Param, Post, Put, UseGuards, UseInterceptors, UploadedFile, Body, BadRequestException, GoneException, ParseIntPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiConsumes } from '@nestjs/swagger';
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
import { Actor } from '../proctor/proctor-access';
import { RecordingUploadsService } from './recording-uploads.service';
import { RecordingUploadOwnerGuard } from './recording-upload-owner.guard';
import { CHUNK_LIMIT } from './recording-upload-policy';
import { CompleteRecordingUploadDto, CreateRecordingUploadDto } from './recording-upload.dto';
import { EvidenceRetentionService } from './evidence-retention.service';
import { EvidenceHoldDto } from './evidence-retention.dto';

export const RECORDING_DIRECTORY = join(tmpdir(), 'proctolearn-recording-chunks');
mkdirSync(RECORDING_DIRECTORY, { recursive: true, mode: 0o700 });

@ApiTags('Дәлелдемелер')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService, private readonly uploads: RecordingUploadsService, private readonly retention: EvidenceRetentionService) {}

  @Post(':attemptId/hold')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  setHold(@Param('attemptId') attemptId: string, @Body() dto: EvidenceHoldDto, @CurrentUser() actor: Actor) {
    return this.retention.setHold(attemptId, actor, dto.onHold, dto.reason);
  }

  @Post(':attemptId/uploads')
  createUpload(@Param('attemptId') attemptId: string, @Body() dto: CreateRecordingUploadDto, @CurrentUser('id') userId: string) {
    return this.uploads.create(attemptId, dto, userId);
  }

  @Get(':attemptId/uploads')
  listUploads(@Param('attemptId') attemptId: string, @CurrentUser('id') userId: string) {
    return this.uploads.list(attemptId, userId);
  }

  @Get('uploads/:id')
  getUpload(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.uploads.get(id, userId);
  }

  @Put('uploads/:id/chunks/:index')
  @UseGuards(RecordingUploadOwnerGuard)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({ destination: RECORDING_DIRECTORY }),
    limits: { fileSize: CHUNK_LIMIT, files: 1, fields: 0, parts: 2 },
  }))
  async uploadChunk(@Param('id') id: string, @Param('index', ParseIntPipe) index: number, @UploadedFile() file: Express.Multer.File, @CurrentUser('id') userId: string) {
    if (!file) throw new BadRequestException('Файл жоқ');
    try { return await this.uploads.putChunk(id, index, file.path, userId); }
    finally { await unlink(file.path).catch(() => undefined); }
  }

  @Post('uploads/:id/complete')
  completeUpload(@Param('id') id: string, @Body() dto: CompleteRecordingUploadDto, @CurrentUser('id') userId: string) {
    return this.uploads.complete(id, dto, userId);
  }

  @Post('uploads/:id/abort')
  abortUpload(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.uploads.abort(id, userId);
  }

  @Get(':attemptId')
  @UseGuards(RolesGuard)
  @Roles(Role.PROCTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Талпыныстың дәлелдемелерін алу (проктор/админ)' })
  getByAttempt(@Param('attemptId') attemptId: string, @CurrentUser() actor: Actor) {
    return this.evidenceService.getEvidenceByAttempt(attemptId, actor);
  }

  @Post(':attemptId/recording')
  @UseGuards(RecordingOwnerGuard)
  @ApiOperation({ summary: 'Ескірген жүктеу: бөліктер арқылы жүктеуге өтіңіз' })
  uploadRecording() {
    throw new GoneException({ code: 'CHUNK_UPLOAD_REQUIRED', message: 'Бетті жаңартыңыз. Жазбалар бөліктер арқылы жүктеледі' });
  }
}
