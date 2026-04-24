import { Module } from '@nestjs/common';
import { AttemptsService } from './attempts.service';
import { AttemptsController } from './attempts.controller';
import { CertificatesModule } from '../certificates/certificates.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';

@Module({
  imports: [CertificatesModule, EnrollmentsModule],
  providers: [AttemptsService],
  controllers: [AttemptsController],
  exports: [AttemptsService],
})
export class AttemptsModule {}
