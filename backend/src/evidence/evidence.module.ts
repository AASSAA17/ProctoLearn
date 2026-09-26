import { Module } from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import { EvidenceController } from './evidence.controller';
import { MulterModule } from '@nestjs/platform-express';
import { RecordingOwnerGuard } from './recording-owner.guard';

@Module({
  imports: [MulterModule.register({ storage: undefined })],
  providers: [EvidenceService, RecordingOwnerGuard],
  controllers: [EvidenceController],
  exports: [EvidenceService],
})
export class EvidenceModule {}
