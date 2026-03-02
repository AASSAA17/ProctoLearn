import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { LessonsModule } from './lessons/lessons.module';
import { ExamsModule } from './exams/exams.module';
import { AttemptsModule } from './attempts/attempts.module';
import { ProctorModule } from './proctor/proctor.module';
import { EvidenceModule } from './evidence/evidence.module';
import { CertificatesModule } from './certificates/certificates.module';
import { MinioModule } from './minio/minio.module';
import { AdminModule } from './admin/admin.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MinioModule,
    MailModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    LessonsModule,
    ExamsModule,
    AttemptsModule,
    ProctorModule,
    EvidenceModule,
    CertificatesModule,
    AdminModule,
  ],
})
export class AppModule {}
