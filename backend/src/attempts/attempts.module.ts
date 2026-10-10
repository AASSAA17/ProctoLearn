import { Module } from '@nestjs/common';
import { AttemptsService } from './attempts.service';
import { AttemptsController } from './attempts.controller';
import { CertificatesModule } from '../certificates/certificates.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { AttemptExpiryService } from './attempt-expiry.service';

@Module({
  imports: [CertificatesModule, EnrollmentsModule],
  providers: [AttemptsService, AttemptExpiryService],
  controllers: [AttemptsController],
  exports: [AttemptsService],
})
export class AttemptsModule {}
