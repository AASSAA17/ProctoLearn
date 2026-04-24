import { Module } from '@nestjs/common';
import { ModulesService } from './modules.service';
import { ModulesController } from './modules.controller';

@Module({
  providers: [ModulesService],
  controllers: [ModulesController],
  exports: [ModulesService],
})
export class CourseModulesModule {}
