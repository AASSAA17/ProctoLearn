import { Module } from '@nestjs/common';
import { AttemptsService } from './attempts.service';
import { AttemptsController } from './attempts.controller';
import { CertificatesModule } from '../certificates/certificates.module';

@Module({
  imports: [CertificatesModule],
  providers: [AttemptsService],
  controllers: [AttemptsController],
  exports: [AttemptsService],
})
export class AttemptsModule {}
