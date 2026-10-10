import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { PilotController } from './pilot.controller';
import { PilotPolicy } from './pilot-policy';
import { PilotService } from './pilot.service';

@Module({
  imports: [EnrollmentsModule],
  controllers: [PilotController],
  providers: [PilotPolicy, PilotService],
  exports: [PilotPolicy, PilotService],
})
export class PilotModule {}
