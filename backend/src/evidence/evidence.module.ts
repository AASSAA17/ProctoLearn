import { Module } from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import { EvidenceController } from './evidence.controller';
import { MulterModule } from '@nestjs/platform-express';
import { RecordingOwnerGuard } from './recording-owner.guard';
import { RecordingUploadsService } from './recording-uploads.service';
import { RecordingUploadOwnerGuard } from './recording-upload-owner.guard';

@Module({
  imports: [MulterModule.register({ storage: undefined })],
  providers: [EvidenceService, RecordingOwnerGuard, RecordingUploadsService, RecordingUploadOwnerGuard],
  controllers: [EvidenceController],
  exports: [EvidenceService, RecordingUploadsService],
})
export class EvidenceModule {}
