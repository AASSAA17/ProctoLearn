import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MailModule } from '../mail/mail.module';
import { CertificatesModule } from '../certificates/certificates.module';

@Module({
  imports: [MailModule, CertificatesModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
