import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitAnswersDto } from './dto/attempt.dto';
import { QuestionType } from '@prisma/client';
import { CertificatesService } from '../certificates/certificates.service';
import { attemptDeadline, attemptExpired, expiredAttemptError, validateAnswerIds } from './attempt-policy';
import { serializable } from '../prisma/serializable';
import { Actor, assertProctorAccess, attemptScope } from '../proctor/proctor-access';

@Injectable()
export class AttemptsService {
  private readonly logger = new Logger(AttemptsService.name);

  constructor(
    private prisma: PrismaService,
    private certificatesService: CertificatesService,
    private configService: ConfigService,
  ) {}

  private static readonly MAX_ATTEMPTS_PER_EXAM = 5;

  async startAttempt(examId: string, userId: string) {
    const attempt = await serializable(this.prisma, async (tx) => {
      const exam = await tx.exam.findUnique({ where: { id: examId }, include: { _count: { select: { questions: true } } } });
      if (!exam) throw new NotFoundException('Емтихан табылмады');
      if (!exam._count.questions) throw new BadRequestException('Емтиханда сұрақтар жоқ');

      const enrollment = await tx.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId: exam.courseId } },
      });
      if (!enrollment) throw new ForbiddenException('Алдымен курсқа тіркеліңіз');

      const includeExam = {
        exam: { include: { questions: { select: { id: true, text: true, type: true, options: true } } } },
      } as const;

      const existingAttempt = await tx.attempt.findFirst({
        where: { examId, userId, status: 'IN_PROGRESS' },
        include: includeExam,
      });

      if (existingAttempt) {
        if (attemptExpired(existingAttempt.startedAt, exam.duration)) {
          await tx.attempt.update({
            where: { id: existingAttempt.id },
            data: { status: 'FAILED', score: 0, finishedAt: new Date() },
          });
          return null;
        }
        return existingAttempt;
      }

      // Enforce max attempts per exam per user
      const totalAttempts = await tx.attempt.count({
        where: { examId, userId },
      });
      if (totalAttempts >= AttemptsService.MAX_ATTEMPTS_PER_EXAM) {
        throw new BadRequestException(
          `Сіз бұл емтиханға ${AttemptsService.MAX_ATTEMPTS_PER_EXAM} рет талпыныс жасадыңыз. Максималды шек.`,
        );
      }

      return tx.attempt.create({
        data: { examId, userId },
        include: includeExam,
      });
    });
    // Throw after committing expiry so this attempt cannot remain active forever.
    if (!attempt) throw expiredAttemptError();
    return {
      ...attempt,
      expiresAt: new Date(attemptDeadline(attempt.startedAt, attempt.exam.duration)).toISOString(),
      serverTime: new Date().toISOString(),
    };
  }

  async submitAnswers(attemptId: string, dto: SubmitAnswersDto, userId: string) {
    const outcome = await serializable(this.prisma, async (tx) => {
      const attempt = await tx.attempt.findUnique({
        where: { id: attemptId },
        include: {
          exam: { include: { questions: true, course: true } },
          user: { select: { id: true, email: true, name: true } },
        },
      });

      if (!attempt) throw new NotFoundException('Талпыныс табылмады');
      if (attempt.userId !== userId) throw new ForbiddenException('Рұқсат жоқ');
      if (attempt.status !== 'IN_PROGRESS') {
        throw new BadRequestException({ code: 'ATTEMPT_CLOSED', message: 'Бұл талпыныс аяқталған немесе тексеруге белгіленген' });
      }
      if (attemptExpired(attempt.startedAt, attempt.exam.duration)) {
        await tx.attempt.update({
          where: { id: attemptId },
          data: { status: 'FAILED', score: 0, finishedAt: new Date() },
        });
        return null;
      }

      const questions = attempt.exam.questions;
      if (!questions.length) throw new BadRequestException('Емтиханда сұрақтар жоқ');
      validateAnswerIds(dto.answers, questions);
      let correctCount = 0;

      const answerRecords = dto.answers.map((ans) => {
        const question = questions.find((q) => q.id === ans.questionId);
        let isCorrect = false;

        if (question) {
          if (question.type === QuestionType.SINGLE_CHOICE || question.type === QuestionType.TEXT) {
            isCorrect = ans.answer.trim().toLowerCase() === question.answer.trim().toLowerCase();
          } else if (question.type === QuestionType.MULTIPLE_CHOICE) {
            const userAnswers = ans.answer.split(',').map((a) => a.trim().toLowerCase()).sort();
            const correctAnswers = question.answer.split(',').map((a) => a.trim().toLowerCase()).sort();
            isCorrect = JSON.stringify(userAnswers) === JSON.stringify(correctAnswers);
          }
          if (isCorrect) correctCount++;
        }

        return {
          attemptId,
          questionId: ans.questionId,
          answer: ans.answer,
          isCorrect,
        };
      });

      const totalQuestions = questions.length;
      const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
      const passed = score >= attempt.exam.passScore;
      // FLAGGED is reserved for proctoring violations; academic failure uses FAILED
      const status = passed ? 'FINISHED' : 'FAILED';

      const changed = await tx.attempt.updateMany({
        where: { id: attemptId, userId, status: 'IN_PROGRESS' },
        data: { score, status, finishedAt: new Date() },
      });
      if (changed.count !== 1) throw new BadRequestException('Бұл талпыныс аяқталған');
      await tx.answer.createMany({ data: answerRecords });
      if (passed) {
        await this.certificatesService.issue(userId, attempt.exam.courseId, tx);
        await tx.enrollment.updateMany({
          where: { userId, courseId: attempt.exam.courseId, completedAt: null },
          data: { completedAt: new Date() },
        });
      }
      return { attempt, score, passed, correctCount, totalQuestions };
    });
    if (!outcome) throw expiredAttemptError();
    const { attempt, score, passed, correctCount, totalQuestions } = outcome;

    const submitPayload = {
      attemptId,
      userId,
      studentEmail: attempt.user.email,
      studentName: attempt.user.name,
      examId: attempt.exam.id,
      examTitle: attempt.exam.title,
      score,
      passed,
      trustScore: attempt.trustScore,
      submittedAt: new Date().toISOString(),
    };

    await this.notifyN8nExamSubmit(submitPayload);

    // Certificate has already been committed; return optional course suggestions.
    if (passed) {
      try {
      // Fetch available courses the user hasn't enrolled in yet
      const enrolledCourseIds = (
        await this.prisma.enrollment.findMany({
          where: { userId },
          select: { courseId: true },
        })
      ).map((e) => e.courseId);

      const availableCourses = await this.prisma.course.findMany({
        where: { id: { notIn: enrolledCourseIds } },
        select: {
          id: true,
          title: true,
          description: true,
          level: true,
          teacher: { select: { name: true } },
          _count: { select: { lessons: true, exams: true } },
        },
        orderBy: { level: 'asc' },
      });

      return { attemptId, score, correctCount, totalQuestions, passed, availableCourses };
      } catch {
        this.logger.warn(`Course suggestions unavailable for completed attempt ${attemptId}`);
        return { attemptId, score, correctCount, totalQuestions, passed, availableCourses: [] };
      }
    }

    return { attemptId, score, correctCount, totalQuestions, passed };
  }

  private async notifyN8nExamSubmit(payload: {
    attemptId: string;
    userId: string;
    studentEmail: string;
    studentName: string;
    examId: string;
    examTitle: string;
    score: number;
    passed: boolean;
    trustScore: number;
    submittedAt: string;
  }) {
    const webhookUrl = this.configService.get<string>('N8N_EXAM_SUBMIT_WEBHOOK_URL');
    if (!webhookUrl) return;

    const webhookToken = this.configService.get<string>('N8N_WEBHOOK_TOKEN');

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (webhookToken) {
        headers['x-webhook-token'] = webhookToken;
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        this.logger.warn(
          `n8n webhook returned non-OK status ${response.status} for attempt ${payload.attemptId}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to send n8n webhook for attempt ${payload.attemptId}: ${(error as Error).message}`,
      );
    }
  }

  async getAttempt(id: string, userId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id },
      include: {
        exam: {
          select: { id: true, title: true, duration: true, passScore: true },
        },
        answers: {
          include: {
            question: {
              select: { id: true, text: true, type: true, options: true },
            },
          },
        },
        events: { orderBy: { timestamp: 'asc' } },
      },
    });

    if (!attempt) throw new NotFoundException('Талпыныс табылмады');
    if (attempt.userId !== userId) throw new ForbiddenException('Рұқсат жоқ');

    return attempt;
  }

  async getUserAttempts(userId: string) {
    return this.prisma.attempt.findMany({
      where: { userId },
      include: {
        exam: { select: { id: true, title: true, passScore: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async getAllAttempts(actor: Actor, examId?: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const where = { ...attemptScope(actor), ...(examId ? { examId } : {}) };

    const [data, total] = await Promise.all([
      this.prisma.attempt.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          exam: { select: { id: true, title: true } },
          _count: { select: { events: true, evidences: true } },
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.attempt.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async flagAttempt(attemptId: string, actor: Actor) {
    await assertProctorAccess(this.prisma, attemptId, actor);
    return this.prisma.attempt.update({
      where: { id: attemptId },
      data: { status: 'FLAGGED' },
    });
  }

  async getAttemptsByExam(examId: string, teacherId: string, role = 'TEACHER') {
    // Validate teacher ownership
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { course: true },
    });
    if (!exam) throw new NotFoundException('Емтихан табылмады');
    if (role !== 'ADMIN' && exam.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');

    return this.prisma.attempt.findMany({
      where: { examId, status: { not: 'IN_PROGRESS' } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { events: true } },
      },
      orderBy: { finishedAt: 'desc' },
    });
  }
}
