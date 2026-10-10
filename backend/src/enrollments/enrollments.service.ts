import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { serializable } from '../prisma/serializable';

@Injectable()
export class EnrollmentsService {
  constructor(private prisma: PrismaService) {}

  /** Preserve repeat enrollment and serialize it with publication/archive transitions. */
  async enroll(userId: string, courseId: string) {
    return serializable(this.prisma, async (tx) => {
      const course = await tx.course.findUnique({ where: { id: courseId } });
      if (!course) throw new NotFoundException('Курс табылмады');

      const existing = await tx.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
      });
      if (existing) {
        if (existing.completedAt) {
          return { message: 'Курс аяқталды', enrollment: existing };
        }
        return { message: 'Курсқа тіркелгенсіз', enrollment: existing };
      }

      if (course.status !== 'PUBLISHED') throw new ForbiddenException('Курс жаңа тіркелуге ашық емес');
      const enrollment = await tx.enrollment.upsert({
        where: { userId_courseId: { userId, courseId } },
        update: {},
        create: { userId, courseId },
        include: { course: { select: { id: true, title: true, level: true } } },
      });
      return { message: 'Курсқа тіркелдіңіз', enrollment };
    });
  }

  /** Get all enrollments for the current user */
  async getMyEnrollments(userId: string) {
    const lessonSelect = {
      id: true,
      assignmentAnswer: true,
      lessonProgress: { where: { userId }, select: { completionSource: true } },
    } as const;
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
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
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment) throw new NotFoundException('Тіркелу табылмады');
    if (enrollment.completedAt) throw new ForbiddenException('Аяқталған курстан шыға алмайсыз');

    await this.prisma.enrollment.delete({
      where: { userId_courseId: { userId, courseId } },
    });
    return { message: 'Курстан шықтыңыз' };
  }

  /** Check if user is enrolled in a course */
  async checkEnrollment(userId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    return {
      enrolled: !!enrollment,
      completed: enrollment?.completedAt ? true : false,
      enrollment: enrollment ?? null,
    };
  }
}
