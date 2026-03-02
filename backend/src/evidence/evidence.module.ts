import { Module } from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import { EvidenceController } from './evidence.controller';

@Module({
  providers: [EvidenceService],
  controllers: [EvidenceController],
  exports: [EvidenceService],
})
export class EvidenceModule {}
