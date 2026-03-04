import { Module } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { LessonsController, ModuleLessonsController, StandaloneLessonsController } from './lessons.controller';

@Module({
  providers: [LessonsService],
  controllers: [LessonsController, ModuleLessonsController, StandaloneLessonsController],
  exports: [LessonsService],
})
export class LessonsModule {}
