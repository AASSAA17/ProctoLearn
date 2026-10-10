import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertCourseReader, lessonCourse, lessonCourseInclude } from '../lessons/lesson-access';

@Injectable()
export class SubmissionsService {
  constructor(private prisma: PrismaService) {}

  async getByStep(stepId: string, userId: string) {
    return this.prisma.submission.findMany({
      where: { stepId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLessonProgress(lessonId: string, userId: string, role = 'STUDENT') {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: lessonCourseInclude });
    if (!lesson) throw new NotFoundException('Сабақ табылмады');
    await assertCourseReader(this.prisma, lessonCourse(lesson), { id: userId, role });
    const steps = await this.prisma.step.findMany({
      where: { lessonId },
      select: { id: true, type: true, order: true },
      orderBy: { order: 'asc' },
    });

    const completedStepIds = await this.prisma.submission
      .groupBy({
        by: ['stepId'],
        where: {
          userId,
          stepId: { in: steps.map((s) => s.id) },
          isCorrect: true,
        },
      })
      .then((rows) => new Set(rows.map((r) => r.stepId)));

    return steps.map((s) => ({
      ...s,
      completed: completedStepIds.has(s.id),
    }));
  }

  async getCourseProgress(courseId: string, userId: string, role = 'STUDENT') {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Курс табылмады');
    await assertCourseReader(this.prisma, course, { id: userId, role });
    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      include: {
        lessons: {
          include: {
            steps: { select: { id: true } },
          },
        },
      },
    });

    const moduleStepIds = modules.flatMap((m) =>
      m.lessons.flatMap((l) => l.steps.map((s) => s.id)),
    );
    const directLessons = await this.prisma.lesson.findMany({
      where: { courseId }, include: { steps: { select: { id: true } } },
    });
    const allStepIds = [...moduleStepIds, ...directLessons.flatMap((l) => l.steps.map((s) => s.id))];

    if (allStepIds.length === 0) return { total: 0, completed: 0, percent: 0 };

    const completedCount = await this.prisma.submission.groupBy({
      by: ['stepId'],
      where: { userId, stepId: { in: allStepIds }, isCorrect: true },
    }).then((rows) => rows.length);

    return {
      total: allStepIds.length,
      completed: completedCount,
      percent: Math.round((completedCount / allStepIds.length) * 100),
    };
  }
}
