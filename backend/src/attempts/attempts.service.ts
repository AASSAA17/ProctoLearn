import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitAnswersDto } from './dto/attempt.dto';
import { QuestionType } from '@prisma/client';
import { CertificatesService } from '../certificates/certificates.service';

@Injectable()
export class AttemptsService {
  constructor(
    private prisma: PrismaService,
    private certificatesService: CertificatesService,
  ) {}

  async startAttempt(examId: string, userId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw new NotFoundException('Емтихан табылмады');

    const includeExam = {
      exam: { include: { questions: { select: { id: true, text: true, type: true, options: true } } } },
    } as const;

    const existingAttempt = await this.prisma.attempt.findFirst({
      where: { examId, userId, status: 'IN_PROGRESS' },
      include: includeExam,
    });

    if (existingAttempt) {
      return existingAttempt;
    }

    return this.prisma.attempt.create({
      data: { examId, userId },
      include: includeExam,
    });
  }

  async submitAnswers(attemptId: string, dto: SubmitAnswersDto, userId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: { include: { questions: true, course: true } },
      },
    });

    if (!attempt) throw new NotFoundException('Талпыныс табылмады');
    if (attempt.userId !== userId) throw new ForbiddenException('Рұқсат жоқ');
    if (attempt.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Бұл талпыныс аяқталған');
    }

    const questions = attempt.exam.questions;
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
    const status = passed ? 'FINISHED' : 'FLAGGED';

    await this.prisma.$transaction([
      this.prisma.answer.createMany({ data: answerRecords }),
      this.prisma.attempt.update({
        where: { id: attemptId },
        data: { score, status, finishedAt: new Date() },
      }),
    ]);

    // Issue certificate if passed
    if (score >= attempt.exam.passScore) {
      await this.certificatesService.issue(userId, attempt.exam.courseId);
    }

    return { attemptId, score, correctCount, totalQuestions, passed };
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
              select: { id: true, text: true, type: true, options: true, answer: true },
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

  async getAllAttempts(examId?: string) {
    return this.prisma.attempt.findMany({
      where: examId ? { examId } : undefined,
      include: {
        user: { select: { id: true, name: true, email: true } },
        exam: { select: { id: true, title: true } },
        _count: { select: { events: true, evidences: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async flagAttempt(attemptId: string) {
    return this.prisma.attempt.update({
      where: { id: attemptId },
      data: { status: 'FLAGGED' },
    });
  }

  async getAttemptsByExam(examId: string, teacherId: string) {
    // Validate teacher ownership
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { course: true },
    });
    if (!exam) throw new NotFoundException('Емтихан табылмады');
    if (exam.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');

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
