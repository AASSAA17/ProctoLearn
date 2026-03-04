import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { CourseModulesModule } from './modules/modules.module';
import { StepsModule } from './steps/steps.module';
import { StepSubmissionsModule } from './step-submissions/step-submissions.module';
import { ActivityInterceptor } from './common/interceptors/activity.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,  // 1 minute window
        limit: 60,    // max 60 requests per minute globally
      },
      {
        name: 'auth',
        ttl: 60_000,  // 1 minute window
        limit: 10,    // max 10 auth attempts per minute (overridden on controller)
      },
    ]),
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
    EnrollmentsModule,
    CourseModulesModule,
    StepsModule,
    StepSubmissionsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityInterceptor,
    },
  ],
})
export class AppModule {}
