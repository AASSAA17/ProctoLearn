import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExamDto, UpdateExamDto, CreateQuestionDto, UpdateQuestionDto } from './dto/exam.dto';
import { assertCourseReader, canManageCourse, LessonViewer } from '../lessons/lesson-access';
import { serializable } from '../prisma/serializable';
import { attemptExpired } from '../attempts/attempt-policy';
import { finalizeExpiredAttempt, snapshotDuration } from '../attempts/attempt-state';
import { validatedQuestion } from './question-policy';

@Injectable()
export class ExamsService {
  constructor(private prisma: PrismaService) {}

  async create(courseId: string, dto: CreateExamDto, viewer: LessonViewer) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Курс табылмады');
    if (!canManageCourse(course, viewer)) throw new ForbiddenException('Рұқсат жоқ');
    const { questions, ...examData } = dto;
    return this.prisma.exam.create({
      data: {
        ...examData, courseId,
        questions: { create: questions.map((question) => validatedQuestion(question)) },
      },
      include: { questions: true },
    });
  }

  async findByCourse(courseId: string, viewer: LessonViewer) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Курс табылмады');
    const manager = await assertCourseReader(this.prisma, course, viewer);
    return this.prisma.exam.findMany({
      where: { courseId },
      include: { _count: { select: { questions: true, attempts: manager } } },
    });
  }

  async findById(courseId: string, id: string, viewer: LessonViewer) {
    const exam = await this.prisma.exam.findUnique({ where: { id }, include: { course: true } });
    if (!exam || exam.courseId !== courseId) throw new NotFoundException('Емтихан табылмады');
    const manager = await assertCourseReader(this.prisma, exam.course, viewer);
    // Students receive questions only from the admitted, timed attempt snapshot.
    const questions = manager ? await this.prisma.question.findMany({
      where: { examId: id },
      select: { id: true, text: true, type: true, options: true, answer: true },
      orderBy: { id: 'asc' },
    }) : [];
    const { course, ...detail } = exam;
    return { ...detail, questions };
  }

  private async editableExam(db: Prisma.TransactionClient, courseId: string, examId: string, viewer: LessonViewer) {
    const exam = await db.exam.findUnique({ where: { id: examId }, include: { course: true, questions: true } });
    if (!exam || exam.courseId !== courseId) throw new NotFoundException('Емтихан табылмады');
    if (!canManageCourse(exam.course, viewer)) throw new ForbiddenException('Рұқсат жоқ');
    const active = await db.attempt.findMany({
      where: { examId, finishedAt: null, status: { in: ['IN_PROGRESS', 'FLAGGED'] } },
    });
    let hasActive = false;
    for (const attempt of active) {
      if (attemptExpired(attempt.startedAt, snapshotDuration({ ...attempt, exam }))) {
        await finalizeExpiredAttempt(db, { ...attempt, exam });
      } else hasActive = true;
    }
    if (hasActive) throw new ConflictException('Емтиханды тапсыру жүріп жатыр. Аяқталғаннан кейін өзгертіңіз');
    return exam;
  }

  private async assertQuestion(db: Prisma.TransactionClient, examId: string, questionId: string) {
    const question = await db.question.findUnique({ where: { id: questionId } });
    if (!question || question.examId !== examId) throw new NotFoundException('Сұрақ табылмады');
    return question;
  }

  async remove(courseId: string, id: string, viewer: LessonViewer) {
    return serializable(this.prisma, async (db) => {
      await this.editableExam(db, courseId, id, viewer);
      if (await db.attempt.count({ where: { examId: id } })) {
        throw new ConflictException('Нәтижелері бар емтиханды жоюға болмайды');
      }
      await db.exam.delete({ where: { id } });
      return { message: 'Емтихан жойылды' };
    });
  }

  async update(courseId: string, id: string, dto: UpdateExamDto, viewer: LessonViewer) {
    return serializable(this.prisma, async (db) => {
      await this.editableExam(db, courseId, id, viewer);
      return db.exam.update({ where: { id }, data: dto });
    });
  }

  async addQuestion(courseId: string, examId: string, dto: CreateQuestionDto, viewer: LessonViewer) {
    return serializable(this.prisma, async (db) => {
      await this.editableExam(db, courseId, examId, viewer);
      return db.question.create({ data: {
        examId, ...validatedQuestion(dto),
      } });
    });
  }

  async updateQuestion(courseId: string, examId: string, questionId: string, dto: UpdateQuestionDto, viewer: LessonViewer) {
    return serializable(this.prisma, async (db) => {
      await this.editableExam(db, courseId, examId, viewer);
      const old = await this.assertQuestion(db, examId, questionId);
      return db.question.update({ where: { id: questionId }, data: validatedQuestion({
        text: dto.text ?? old.text,
        type: dto.type ?? old.type,
        options: dto.options ?? (Array.isArray(old.options) ? old.options as string[] : []),
        answer: dto.answer ?? old.answer,
      }) });
    });
  }

  async removeQuestion(courseId: string, examId: string, questionId: string, viewer: LessonViewer) {
    return serializable(this.prisma, async (db) => {
      await this.editableExam(db, courseId, examId, viewer);
      await this.assertQuestion(db, examId, questionId);
      if (await db.answer.count({ where: { questionId } })) {
        throw new ConflictException('Сақталған жауаптары бар сұрақты жоюға болмайды');
      }
      await db.question.delete({ where: { id: questionId } });
      return { message: 'Сұрақ жойылды' };
    });
  }
}
