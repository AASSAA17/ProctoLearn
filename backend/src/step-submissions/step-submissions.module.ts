import { Module } from '@nestjs/common';
import { SubmissionsService } from './step-submissions.service';
import { SubmissionsController } from './step-submissions.controller';

@Module({
  providers: [SubmissionsService],
  controllers: [SubmissionsController],
  exports: [SubmissionsService],
})
export class StepSubmissionsModule {}
