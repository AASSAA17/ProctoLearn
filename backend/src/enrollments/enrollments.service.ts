import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { serializable } from '../prisma/serializable';
import { pilotSettings } from '../pilot/pilot-policy';
import { attemptExpired } from '../attempts/attempt-policy';
import { recordAudit } from '../operations/operation-events';

@Injectable()
export class EnrollmentsService {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  private pilot() {
    return pilotSettings(this.config ?? { get: () => undefined });
  }

  /** Preserve repeat enrollment and serialize it with publication/archive transitions. */
  async enroll(userId: string, courseId: string) {
    const pilot = this.pilot();
    return serializable(this.prisma, async (tx) => {
      const course = await tx.course.findUnique({ where: { id: courseId } });
      if (!course) throw new NotFoundException('Курс табылмады');

      const existing = await tx.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
      });
      if (existing && existing.accessStatus !== 'WITHDRAWN') {
        if (existing.completedAt) {
          return { message: 'Курс аяқталды', enrollment: existing };
        }
        return { message: 'Курсқа тіркелгенсіз', enrollment: existing };
      }

      if (course.status !== 'PUBLISHED') throw new ForbiddenException('Курс жаңа тіркелуге ашық емес');
      if (pilot.enabled) {
        const membership = await tx.pilotMembership.findUnique({ where: { userId }, select: { status: true } });
        if (!membership || membership.status !== 'ACTIVE') {
          throw new ForbiddenException({ code: 'PILOT_ACCESS_DENIED', message: 'Бұл курсқа пилот қатысушысы ғана тіркеле алады' });
        }
        const occupied = await tx.enrollment.count({ where: { courseId, accessStatus: 'ACTIVE' } });
        if (occupied >= pilot.defaultCourseSeats) {
          throw new ConflictException({ code: 'COURSE_FULL', message: 'Курста бос орын жоқ' });
        }
      }
      const enrollment = await tx.enrollment.upsert({
        where: { userId_courseId: { userId, courseId } },
        update: { accessStatus: 'ACTIVE', withdrawnAt: null },
        create: { userId, courseId, accessStatus: 'ACTIVE' },
        include: { course: { select: { id: true, title: true, level: true } } },
      });
      return { message: 'Курсқа тіркелдіңіз', enrollment };
    });
  }

  /** Get all enrollments for the current user */
  async getMyEnrollments(userId: string) {
    const pilot = this.pilot();
    const lessonSelect = {
      id: true,
      assignmentAnswer: true,
      lessonProgress: { where: { userId }, select: { completionSource: true } },
    } as const;
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, ...(pilot.enabled ? { accessStatus: 'ACTIVE' as const } : {}) },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            level: true,
            _count: { select: { lessons: true, exams: true } },
            lessons: { select: lessonSelect },
            modules: { select: { lessons: { select: lessonSelect } } },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
    return enrollments.map(({ course, ...enrollment }) => {
      const { lessons, modules, ...outline } = course;
      const unique = new Map([...lessons, ...modules.flatMap(module => module.lessons)].map(lesson => [lesson.id, lesson]));
      const totalLessons = unique.size;
      const completedLessons = [...unique.values()].filter(lesson => lesson.lessonProgress.some(
        progress => !lesson.assignmentAnswer || progress.completionSource === 'ASSIGNMENT',
      )).length;
      return {
        ...enrollment,
        course: { ...outline, _count: { ...outline._count, lessons: totalLessons } },
        totalLessons,
        completedLessons,
        progress: totalLessons ? Math.round(completedLessons / totalLessons * 100) : 0,
      };
    });
  }

  /** Get the currently active (not completed) enrollment */
  async getActiveEnrollment(userId: string) {
    return (await this.getMyEnrollments(userId)).find(enrollment => !enrollment.completedAt) ?? null;
  }

  /** Mark enrollment as completed */
  async completeEnrollment(userId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment) throw new NotFoundException('Тіркелу табылмады');
    if (this.pilot().enabled && enrollment.accessStatus === 'WITHDRAWN') throw new ForbiddenException('Курсқа белсенді тіркелу жоқ');
    if (enrollment.completedAt) return { message: 'Курс бұрын аяқталған', enrollment };

    const certificate = await this.prisma.certificate.findFirst({ where: { userId, courseId } });
    if (!certificate) throw new ForbiddenException('Курс емтихан мен тексеру аяқталғаннан кейін жабылады');

    const updated = await this.prisma.enrollment.update({
      where: { userId_courseId: { userId, courseId } },
      data: { completedAt: new Date() },
    });
    return { message: 'Курс аяқталды', enrollment: updated };
  }

  /** Unenroll from a course (only if not completed) */
  async unenroll(userId: string, courseId: string) {
    if (this.pilot().enabled) {
      return serializable(this.prisma, async tx => {
        return this.withdrawPilotEnrollment(tx, userId, courseId, userId, false);
      });
    }
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment) throw new NotFoundException('Тіркелу табылмады');
    if (enrollment.completedAt) throw new ForbiddenException('Аяқталған курстан шыға алмайсыз');

    await this.prisma.enrollment.delete({ where: { userId_courseId: { userId, courseId } } });
    return { message: 'Курстан шықтыңыз' };
  }

  /** Staff can release an abandoned pilot seat without deleting learning history. */
  async withdrawByStaff(actorId: string, userId: string, courseId: string) {
    if (!this.pilot().enabled) throw new ForbiddenException('Пилот режимі өшірулі');
    return serializable(this.prisma, async tx => {
      return this.withdrawPilotEnrollment(tx, userId, courseId, actorId, true);
    });
  }

  private async withdrawPilotEnrollment(
    tx: Prisma.TransactionClient,
    userId: string,
    courseId: string,
    actorId: string,
    allowCompleted: boolean,
  ) {
    const enrollment = await tx.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
    if (!enrollment) throw new NotFoundException('Тіркелу табылмады');
    if (enrollment.accessStatus === 'WITHDRAWN') return { message: 'Курстан шықтыңыз' };
    if (enrollment.completedAt && !allowCompleted) throw new ForbiddenException('Аяқталған курстан шыға алмайсыз');

    const attempt = await tx.attempt.findFirst({
      where: { userId, status: { in: ['IN_PROGRESS', 'FLAGGED'] }, finishedAt: null, exam: { courseId } },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true, examSnapshot: true, exam: { select: { duration: true } } },
    });
    if (attempt) {
      const snapshot = attempt.examSnapshot as { duration?: unknown } | null;
      const duration = Number.isInteger(snapshot?.duration) && Number(snapshot?.duration) > 0
        ? Number(snapshot?.duration)
        : attempt.exam.duration;
      if (!attemptExpired(attempt.startedAt, duration)) {
        throw new ConflictException({
          code: 'ACTIVE_EXAM_ATTEMPT',
          message: 'Белсенді емтихан аяқталмайынша курстан шығу мүмкін емес',
        });
      }
    }

    const changed = await tx.enrollment.updateMany({
      where: { id: enrollment.id, accessStatus: 'ACTIVE', ...(!allowCompleted ? { completedAt: null } : {}) },
      data: { accessStatus: 'WITHDRAWN', withdrawnAt: new Date() },
    });
    if (changed.count !== 1) throw new ConflictException('Тіркелу күйі өзгерді. Қайта көріңіз');
    await recordAudit(tx, {
      actorId,
      action: 'PILOT_COURSE_WITHDRAWN',
      targetType: 'USER',
      targetId: userId,
      metadata: { courseId },
    });
    return { message: 'Курстан шықтыңыз' };
  }

  /** Check if user is enrolled in a course */
  async checkEnrollment(userId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    const active = !!enrollment && (!this.pilot().enabled || enrollment.accessStatus !== 'WITHDRAWN');
    return {
      enrolled: active,
      completed: enrollment?.completedAt ? true : false,
      enrollment: active ? enrollment : null,
    };
  }
}
