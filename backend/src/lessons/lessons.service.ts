import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLessonDto, UpdateLessonDto } from './dto/lesson.dto';
import {
  LessonViewer, assertCourseManager, assertCourseReader, lessonCourse,
  lessonCourseInclude, lessonSummary, sanitizeLesson,
} from './lesson-access';

@Injectable()
export class LessonsService {
  constructor(private prisma: PrismaService) {}

  async create(courseId: string, dto: CreateLessonDto, viewer: LessonViewer) {
    const course = await this.getCourse(courseId);
    assertCourseManager(course, viewer);
    return this.prisma.lesson.create({ data: { ...dto, courseId } });
  }

  async findByCourse(courseId: string, viewer: LessonViewer) {
    const course = await this.getCourse(courseId);
    const manager = await assertCourseReader(this.prisma, course, viewer);
    const lessons = await this.prisma.lesson.findMany({ where: { courseId }, orderBy: { order: 'asc' } });
    return lessons.map((lesson) => sanitizeLesson(lesson, manager));
  }

  async createForModule(moduleId: string, dto: CreateLessonDto, viewer: LessonViewer) {
    const mod = await this.getModule(moduleId);
    assertCourseManager(mod.course, viewer);
    return this.prisma.lesson.create({ data: { ...dto, moduleId } });
  }

  async findByModule(moduleId: string, viewer: LessonViewer) {
    const mod = await this.getModule(moduleId);
    const manager = await assertCourseReader(this.prisma, mod.course, viewer);
    const lessons = await this.prisma.lesson.findMany({
      where: { moduleId }, orderBy: { order: 'asc' },
      include: { steps: { orderBy: { order: 'asc' }, select: { id: true, type: true, order: true } } },
    });
    return lessons.map((lesson) => sanitizeLesson(lesson, manager));
  }

  async findById(id: string, viewer: LessonViewer, courseId?: string) {
    const lesson = await this.getLesson(id);
    const manager = await assertCourseReader(this.prisma, lessonCourse(lesson, courseId), viewer);
    await this.checkPreviousLessons(lesson, viewer, manager);
    // Reading a lesson must not complete its assignment or unlock subsequent lessons.
    return sanitizeLesson(lesson, manager);
  }

  async update(id: string, dto: UpdateLessonDto, viewer: LessonViewer, courseId?: string) {
    const lesson = await this.getLesson(id);
    assertCourseManager(lessonCourse(lesson, courseId), viewer);
    return this.prisma.lesson.update({ where: { id }, data: dto });
  }

  async remove(id: string, viewer: LessonViewer, courseId?: string) {
    const lesson = await this.getLesson(id);
    assertCourseManager(lessonCourse(lesson, courseId), viewer);
    await this.prisma.lesson.delete({ where: { id } });
    return { message: 'Сабақ жойылды' };
  }

  async getMyProgress(courseId: string, userId: string) {
    await this.getCourse(courseId);
    const lessons = await this.prisma.lesson.findMany({
      where: { OR: [{ courseId }, { module: { courseId } }] },
      orderBy: [{ module: { order: 'asc' } }, { order: 'asc' }],
    });
    const progress = await this.prisma.lessonProgress.findMany({ where: { courseId, userId } });
    const progressMap = new Map(progress.map((p) => [p.lessonId, p]));
    return lessons.map((lesson) => ({
      ...lessonSummary(lesson),
      completed: progressMap.has(lesson.id) && (!lesson.assignmentAnswer || progressMap.get(lesson.id)?.completionSource === 'ASSIGNMENT'),
      viewedAt: progressMap.get(lesson.id)?.viewedAt ?? null,
    }));
  }

  async checkAssignment(lessonId: string, viewer: LessonViewer, userAnswer: string, courseId?: string) {
    const lesson = await this.getLesson(lessonId);
    const course = lessonCourse(lesson, courseId);
    const manager = await assertCourseReader(this.prisma, course, viewer);
    await this.checkPreviousLessons(lesson, viewer, manager);
    if (!lesson.assignmentAnswer) throw new BadRequestException('Бұл сабақта тексерілетін тапсырма жоқ');
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[;"'.,!?]/g, '');
    const normalizedAnswer = normalize(userAnswer);
    const expectedRaw = lesson.assignmentAnswer;
    let correct = false;
    if (expectedRaw.trim().toLowerCase() === 'any' || expectedRaw.trim().toLowerCase() === 'кез келген') {
      correct = normalizedAnswer.length >= 10;
    } else if (expectedRaw.includes('|')) {
      const keywords = expectedRaw.split('|').map(normalize).filter(Boolean);
      correct = keywords.some((keyword) => normalizedAnswer.includes(keyword));
    } else {
      const expected = normalize(expectedRaw);
      correct = !!expected && normalizedAnswer.includes(expected);
    }
    if (correct && !manager) {
      await this.checkCompletedTasks(lesson, viewer);
      await this.complete(lessonId, course.id, viewer.id, 'ASSIGNMENT');
    }
    return { correct, feedback: correct ? 'Дұрыс! 🎉 Сабақ аяқталды.' : 'Қате. Қайта көріңіз және 15 секундтан кейін қайталаңыз.' };
  }

  async markCompleted(lessonId: string, viewer: LessonViewer, courseId?: string) {
    const lesson = await this.getLesson(lessonId);
    const course = lessonCourse(lesson, courseId);
    const manager = await assertCourseReader(this.prisma, course, viewer);
    await this.checkPreviousLessons(lesson, viewer, manager);
    if (lesson.assignmentAnswer) throw new BadRequestException('Алдымен тапсырманы орындаңыз');
    await this.checkCompletedTasks(lesson, viewer);
    if (!manager) await this.complete(lessonId, course.id, viewer.id);
    return { message: 'Сабақ аяқталды' };
  }

  private async checkCompletedTasks(lesson: any, viewer: LessonViewer) {
    const taskIds = lesson.steps.filter((step: any) => step.type === 'TASK').map((step: any) => step.id);
    if (taskIds.length) {
      const completed = await this.prisma.submission.groupBy({
        by: ['stepId'], where: { userId: viewer.id, stepId: { in: taskIds }, isCorrect: true },
      });
      if (completed.length < taskIds.length) throw new BadRequestException('Алдымен тапсырмаларды орындаңыз');
    }
  }

  private async getCourse(id: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Курс табылмады');
    return course;
  }

  private async getModule(id: string) {
    const mod = await this.prisma.courseModule.findUnique({ where: { id }, include: { course: true } });
    if (!mod) throw new NotFoundException('Бөлім табылмады');
    return mod;
  }

  private async getLesson(id: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id }, include: { ...lessonCourseInclude, steps: { orderBy: { order: 'asc' } } },
    });
    if (!lesson) throw new NotFoundException('Сабақ табылмады');
    return lesson;
  }

  private async checkPreviousLessons(lesson: any, viewer: LessonViewer, manager: boolean) {
    const courseId = lesson.courseId ?? lesson.module?.courseId ?? lesson.module?.course?.id;
    if (manager || !courseId) return;
    const enrollment = await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId: viewer.id, courseId } } });
    if (enrollment?.examAccessGrantedAt) return;
    const previous = await this.prisma.lesson.findMany({
      where: { OR: [{ courseId }, { module: { courseId } }] },
      include: { module: { select: { order: true } } },
    });
    const currentKey = `${lesson.module?.order ?? 0}:${lesson.order}`;
    const orderedPrevious = previous.filter((candidate) => `${candidate.module?.order ?? 0}:${candidate.order}` < currentKey);
    const count = await this.prisma.lessonProgress.count({
      where: { userId: viewer.id, lessonId: { in: orderedPrevious.map(({ id }) => id) } },
    });
    if (count < orderedPrevious.length) throw new ForbiddenException('Алдыңғы сабақтарды аяқтаңыз');
  }

  private complete(lessonId: string, courseId: string, userId: string, completionSource = 'MATERIAL') {
    return this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { viewedAt: new Date(), completionSource }, create: { userId, courseId, lessonId, completionSource },
    });
  }
}
