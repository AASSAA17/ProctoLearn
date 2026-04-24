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

  async createForModule(moduleId: string, dto: CreateLessonDto, teacherId: string) {
    const mod = await this.prisma.courseModule.findUnique({
      where: { id: moduleId },
      include: { course: true },
    });
    if (!mod) throw new NotFoundException('Бөлім табылмады');
    if (mod.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    return this.prisma.lesson.create({ data: { ...dto, moduleId } });
  }

  async findByModule(moduleId: string) {
    return this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: { order: 'asc' },
      include: { steps: { orderBy: { order: 'asc' }, select: { id: true, type: true, order: true } } },
    });
  }

  async findById(id: string, userId?: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { order: 'asc' } },
      },
    });
    if (!lesson) throw new NotFoundException('Сабақ табылмады');

    // Block skipping only for old-style (course-direct) lessons
    if (userId && lesson.courseId && lesson.order > 1) {
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

    // Track progress (fire-and-forget) — only for course-direct lessons
    if (userId && lesson.courseId) {
      this.prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId: id } },
        update: { viewedAt: new Date() },
        create: { userId, courseId: lesson.courseId, lessonId: id },
      }).catch(() => {});
    }

    return lesson;
  }

  private async resolveTeacherId(lesson: any): Promise<string | undefined> {
    if (lesson.course) return lesson.course.teacherId;
    if (lesson.moduleId) {
      const mod = await this.prisma.courseModule.findUnique({
        where: { id: lesson.moduleId },
        include: { course: true },
      });
      return mod?.course?.teacherId;
    }
    return undefined;
  }

  async update(id: string, dto: Partial<CreateLessonDto>, teacherId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!lesson) throw new NotFoundException('Сабақ табылмады');
    const ownerId = await this.resolveTeacherId(lesson);
    if (ownerId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    return this.prisma.lesson.update({ where: { id }, data: dto });
  }

  async remove(id: string, teacherId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!lesson) throw new NotFoundException('Сабақ табылмады');
    const ownerId = await this.resolveTeacherId(lesson);
    if (ownerId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
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
      s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[;"'.,!?]/g, '');

    const normalizedAnswer = normalize(userAnswer);
    const expectedRaw = lesson.assignmentAnswer;

    // Support pipe-separated keywords: "python|питон|пайтон"
    // Also support "any" keyword — accept any non-empty answer (open-ended)
    let correct = false;
    if (expectedRaw.trim().toLowerCase() === 'any' || expectedRaw.trim().toLowerCase() === 'кез келген') {
      correct = normalizedAnswer.length >= 10; // at least 10 chars for open-ended
    } else if (expectedRaw.includes('|')) {
      const keywords = expectedRaw.split('|').map(k => normalize(k));
      correct = keywords.some(kw => normalizedAnswer.includes(kw));
    } else {
      // Contains check: user answer must contain the expected keyword/phrase
      correct = normalizedAnswer.includes(normalize(expectedRaw));
    }

    // If correct: mark lesson as completed
    if (correct && lesson.courseId) {
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
    if (lesson.courseId) {
      await this.prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        update: { viewedAt: new Date() },
        create: { userId, courseId: lesson.courseId, lessonId },
      });
    }
    return { message: 'Сабақ аяқталды' };
  }
}
