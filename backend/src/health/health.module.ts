import { Module } from '@nestjs/common';
import { DatabaseProbe } from './database-probe';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({ controllers: [HealthController], providers: [DatabaseProbe, HealthService] })
export class HealthModule {}
