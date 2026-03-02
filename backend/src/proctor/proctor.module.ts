import { Module } from '@nestjs/common';
import { ProctorGateway } from './proctor.gateway';
import { ProctorService } from './proctor.service';
import { ProctorController } from './proctor.controller';
import { EvidenceModule } from '../evidence/evidence.module';

@Module({
  imports: [EvidenceModule],
  providers: [ProctorGateway, ProctorService],
  controllers: [ProctorController],
})
export class ProctorModule {}
