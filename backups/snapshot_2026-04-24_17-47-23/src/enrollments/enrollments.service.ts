import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EnrollmentsService {
  constructor(private prisma: PrismaService) {}

  /** Enroll user in a course. Fails if user has another active enrollment. */
  async enroll(userId: string, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Курс табылмады');

    // Check if already enrolled in this course
    const existing = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing) {
      if (existing.completedAt) {
        return { message: 'Курс аяқталды', enrollment: existing };
      }
      return { message: 'Курсқа тіркелгенсіз', enrollment: existing };
    }

    const enrollment = await this.prisma.enrollment.create({
      data: { userId, courseId },
      include: { course: { select: { id: true, title: true, level: true } } },
    });
    return { message: 'Курсқа тіркелдіңіз', enrollment };
  }

  /** Get all enrollments for the current user */
  async getMyEnrollments(userId: string) {
    return this.prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            level: true,
            _count: { select: { lessons: true, exams: true } },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }

  /** Get the currently active (not completed) enrollment */
  async getActiveEnrollment(userId: string) {
    return this.prisma.enrollment.findFirst({
      where: { userId, completedAt: null },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            level: true,
            _count: { select: { lessons: true, exams: true } },
          },
        },
      },
    });
  }

  /** Mark enrollment as completed */
  async completeEnrollment(userId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment) throw new NotFoundException('Тіркелу табылмады');
    if (enrollment.completedAt) return { message: 'Курс бұрын аяқталған', enrollment };

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
