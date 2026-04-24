import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ProctorGateway } from './proctor.gateway';
import { ProctorService } from './proctor.service';
import { ProctorController } from './proctor.controller';
import { EvidenceModule } from '../evidence/evidence.module';

@Module({
  imports: [EvidenceModule, JwtModule.register({})],
  providers: [ProctorGateway, ProctorService],
  controllers: [ProctorController],
})
export class ProctorModule {}
