import { Module } from '@nestjs/common';
import { OperationsService } from './operations.service';
import { AuditController, NotificationsController } from './operations.controller';
@Module({ controllers: [AuditController, NotificationsController], providers: [OperationsService] })
export class OperationsModule {}
