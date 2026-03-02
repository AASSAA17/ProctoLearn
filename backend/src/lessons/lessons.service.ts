import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLessonDto } from './dto/lesson.dto';

@Injectable()
export class LessonsService {
  constructor(private prisma: PrismaService) {}

  async create(courseId: string, dto: CreateLessonDto, teacherId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Курс табылмады');
    if (course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    return this.prisma.lesson.create({ data: { ...dto, courseId } });
  }

  async findByCourse(courseId: string) {
    return this.prisma.lesson.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
    });
  }

  async findById(id: string, userId?: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Сабақ табылмады');

    // Block skipping: user must complete all previous lessons first
    if (userId && lesson.order > 1) {
      const prevLessons = await this.prisma.lesson.findMany({
        where: { courseId: lesson.courseId, order: { lt: lesson.order } },
        select: { id: true },
      });
      const completedCount = await this.prisma.lessonProgress.count({
        where: { userId, lessonId: { in: prevLessons.map((l) => l.id) } },
      });
      if (completedCount < prevLessons.length) {
        throw new ForbiddenException('Алдыңғы сабақтарды аяқтаңыз');
      }
    }

    // Track progress (fire-and-forget)
    if (userId) {
      this.prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId: id } },
        update: { viewedAt: new Date() },
        create: { userId, courseId: lesson.courseId, lessonId: id },
      }).catch(() => {});
    }

    return lesson;
  }

  async update(id: string, dto: Partial<CreateLessonDto>, teacherId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!lesson) throw new NotFoundException('Сабақ табылмады');
    if (lesson.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    return this.prisma.lesson.update({ where: { id }, data: dto });
  }

  async remove(id: string, teacherId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!lesson) throw new NotFoundException('Сабақ табылмады');
    if (lesson.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    await this.prisma.lesson.delete({ where: { id } });
    return { message: 'Сабақ жойылды' };
  }

  async getMyProgress(courseId: string, userId: string) {
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
    });
    const progress = await this.prisma.lessonProgress.findMany({
      where: { courseId, userId },
    });
    const progressMap = new Map(progress.map((p) => [p.lessonId, p.viewedAt]));
    return lessons.map((lesson) => ({
      ...lesson,
      // Never expose the correct answer to the client
      assignmentAnswer: undefined,
      completed: progressMap.has(lesson.id),
      viewedAt: progressMap.get(lesson.id) ?? null,
    }));
  }

  /** Check the user's assignment answer. Returns correct: true/false. */
  async checkAssignment(lessonId: string, userId: string, userAnswer: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Сабақ табылмады');
    if (!lesson.assignmentAnswer) {
      throw new BadRequestException('Бұл сабақта тексерілетін тапсырма жоқ');
    }

    const normalize = (s: string) =>
      s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[;"']/g, '');

    const correct = normalize(userAnswer) === normalize(lesson.assignmentAnswer);

    // If correct: mark lesson as completed
    if (correct) {
      await this.prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        update: { viewedAt: new Date() },
        create: { userId, courseId: lesson.courseId, lessonId },
      });
    }

    return { correct, feedback: correct ? 'Дұрыс! 🎉 Сабақ аяқталды.' : 'Қате. Қайта көріңіз және 15 секундтан кейін қайталаңыз.' };
  }

  /** Mark lesson as completed without assignment check (reading-type lessons). */
  async markCompleted(lessonId: string, userId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Сабақ табылмады');
    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { viewedAt: new Date() },
      create: { userId, courseId: lesson.courseId, lessonId },
    });
    return { message: 'Сабақ аяқталды' };
  }
}
