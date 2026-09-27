import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SaveDraftDto, SubmitAnswersDto } from './dto/attempt.dto';
import { CertificatesService } from '../certificates/certificates.service';
import { attemptDeadline, attemptExpired, expiredAttemptError, validateAnswerIds } from './attempt-policy';
import { serializable } from '../prisma/serializable';
import { Actor, assertProctorAccess, attemptScope } from '../proctor/proctor-access';
import { draftForAttempt, examSnapshot, finalizeExpiredAttempt, gradeAnswerRecords, publicExam, safeAttempt, snapshotDuration, snapshotForAttempt, submissionDigest } from './attempt-state';

@Injectable()
export class AttemptsService {
  private readonly logger = new Logger(AttemptsService.name);

  constructor(
    private prisma: PrismaService,
    private certificatesService: CertificatesService,
    private configService: ConfigService,
  ) {}

  private static readonly MAX_ATTEMPTS_PER_EXAM = 5;

  private async assertAdmission(tx: Prisma.TransactionClient, userId: string, courseId: string, enrollment: any) {
    if (enrollment.examAccessGrantedAt) return;
    const lessons = await tx.lesson.findMany({
      where: { OR: [{ courseId }, { module: { courseId } }] },
      select: { id: true, assignmentAnswer: true, steps: { where: { type: 'TASK' }, select: { id: true } } },
    });
    const progress = await tx.lessonProgress.findMany({
      where: { userId, lessonId: { in: lessons.map((lesson) => lesson.id) } },
      select: { lessonId: true, completionSource: true },
    });
    const completed = new Map(progress.map((entry) => [entry.lessonId, entry.completionSource]));
    if (lessons.some((lesson) => !completed.has(lesson.id) || (lesson.assignmentAnswer && completed.get(lesson.id) !== 'ASSIGNMENT'))) {
      throw new ForbiddenException({ code: 'COURSE_INCOMPLETE', message: 'Емтихан алдында барлық сабақтар мен тапсырмаларды аяқтаңыз' });
    }
    const taskIds = lessons.flatMap((lesson) => lesson.steps.map((step) => step.id));
    if (taskIds.length) {
      const solved = await tx.submission.groupBy({
        by: ['stepId'], where: { userId, stepId: { in: taskIds }, isCorrect: true },
      });
      if (solved.length !== taskIds.length) throw new ForbiddenException({ code: 'COURSE_INCOMPLETE', message: 'Емтихан алдында барлық тапсырмаларды орындаңыз' });
    }
  }

  private async withSnapshot(tx: Prisma.TransactionClient, attempt: any) {
    const snapshot = snapshotForAttempt(attempt);
    if (!attempt.examSnapshot) {
      await tx.attempt.update({ where: { id: attempt.id }, data: { examSnapshot: snapshot as unknown as Prisma.InputJsonValue } });
    }
    return { ...attempt, examSnapshot: snapshot };
  }

  private async ownedAttempt(tx: Prisma.TransactionClient, id: string, userId: string) {
    const attempt = await tx.attempt.findUnique({
      where: { id },
      include: { exam: { include: { questions: { orderBy: { id: 'asc' } } } }, answers: true, user: { select: { id: true, email: true, name: true } } },
    });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');
    if (attempt.userId !== userId) throw new ForbiddenException('Рұқсат жоқ');
    return this.withSnapshot(tx, attempt);
  }

  private closedError() {
    return new ConflictException({ code: 'ATTEMPT_CLOSED', message: 'Бұл талпыныс аяқталған' });
  }

  private async expire(tx: Prisma.TransactionClient, attempt: any) {
    await finalizeExpiredAttempt(tx, attempt);
  }

  async startAttempt(examId: string, userId: string) {
    const attempt = await serializable(this.prisma, async (tx) => {
      const exam = await tx.exam.findUnique({ where: { id: examId }, include: { questions: { orderBy: { id: 'asc' } } } });
      if (!exam) throw new NotFoundException('Емтихан табылмады');
      const enrollment = await tx.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: exam.courseId } } });
      if (!enrollment) throw new ForbiddenException('Алдымен курсқа тіркеліңіз');
      const existing = await tx.attempt.findFirst({ where: { examId, userId, status: 'IN_PROGRESS', finishedAt: null } });
      if (existing) {
        const active = await this.withSnapshot(tx, { ...existing, exam });
        if (attemptExpired(active.startedAt, active.examSnapshot.duration)) {
          await this.expire(tx, active);
          return null;
        }
        return active;
      }
      const snapshot = examSnapshot(exam);
      if (!snapshot.questions.length) throw new BadRequestException('Емтиханда сұрақтар жоқ');
      await this.assertAdmission(tx, userId, exam.courseId, enrollment);
      const count = await tx.attempt.count({ where: { examId, userId } });
      if (count >= AttemptsService.MAX_ATTEMPTS_PER_EXAM) throw new BadRequestException('Бұл емтиханға талпыныстар саны шектелген (5)');
      return tx.attempt.create({ data: { examId, userId, examSnapshot: snapshot as unknown as Prisma.InputJsonValue } });
    });
    if (!attempt) throw expiredAttemptError();
    const snapshot = snapshotForAttempt(attempt);
    return {
      ...safeAttempt(attempt), exam: publicExam(snapshot), draft: draftForAttempt(attempt),
      expiresAt: new Date(attemptDeadline(attempt.startedAt, snapshot.duration)).toISOString(), serverTime: new Date().toISOString(),
    };
  }

  async getDraft(attemptId: string, userId: string) {
    const draft = await serializable(this.prisma, async (tx) => {
      const attempt = await this.ownedAttempt(tx, attemptId, userId);
      if (attempt.status !== 'IN_PROGRESS' || attempt.finishedAt) throw this.closedError();
      if (attemptExpired(attempt.startedAt, attempt.examSnapshot.duration)) {
        await this.expire(tx, attempt);
        return null;
      }
      return draftForAttempt(attempt);
    });
    if (!draft) throw expiredAttemptError();
    return draft;
  }

  async saveDraft(attemptId: string, dto: SaveDraftDto, userId: string) {
    const draft = await serializable(this.prisma, async (tx) => {
      const attempt = await this.ownedAttempt(tx, attemptId, userId);
      if (attempt.status !== 'IN_PROGRESS' || attempt.finishedAt) throw this.closedError();
      if (attemptExpired(attempt.startedAt, attempt.examSnapshot.duration)) {
        await this.expire(tx, attempt);
        return null;
      }
      validateAnswerIds(dto.answers, attempt.examSnapshot.questions);
      if (attempt.draftRevision !== dto.revision) throw new ConflictException({ code: 'DRAFT_CONFLICT', message: 'Жауаптар басқа терезеде өзгертілген. Соңғы нұсқаны жүктеңіз' });
      const updatedAt = new Date();
      const changed = await tx.attempt.updateMany({
        where: { id: attemptId, userId, status: 'IN_PROGRESS', finishedAt: null, draftRevision: dto.revision },
        data: { draftAnswers: dto.answers.map(({ questionId, answer }) => ({ questionId, answer })), draftRevision: { increment: 1 }, draftUpdatedAt: updatedAt },
      });
      if (changed.count !== 1) throw new ConflictException({ code: 'DRAFT_CONFLICT', message: 'Жауаптардың соңғы нұсқасын жүктеңіз' });
      return { answers: dto.answers, revision: dto.revision + 1, updatedAt };
    });
    if (!draft) throw expiredAttemptError();
    return draft;
  }

  private submissionResult(attempt: any, snapshot: any) {
    const passed = attempt.status === 'FINISHED' && attempt.score >= snapshot.passScore;
    return {
      attemptId: attempt.id, score: attempt.score, passed,
      correctCount: attempt.answers.filter((answer: any) => answer.isCorrect === true).length,
      totalQuestions: snapshot.questions.length,
      reviewStatus: attempt.reviewStatus,
      certificatePending: passed && attempt.reviewStatus === 'PENDING',
      availableCourses: [],
    };
  }

  async submitAnswers(attemptId: string, dto: SubmitAnswersDto, userId: string) {
    const outcome = await serializable(this.prisma, async (tx) => {
      const attempt = await this.ownedAttempt(tx, attemptId, userId);
      const snapshot = attempt.examSnapshot;
      validateAnswerIds(dto.answers, snapshot.questions);
      const digest = submissionDigest(dto.answers, snapshot);
      if (attempt.status !== 'IN_PROGRESS' || attempt.finishedAt) {
        if (attempt.submissionDigest === digest) return { result: this.submissionResult(attempt, snapshot), attempt, replayed: true };
        if (attempt.submissionDigest) throw new ConflictException({ code: 'SUBMISSION_CONFLICT', message: 'Басқа жауаптармен талпыныс аяқталған' });
        throw this.closedError();
      }
      if (attemptExpired(attempt.startedAt, snapshot.duration)) {
        await this.expire(tx, attempt);
        return null;
      }
      if (!snapshot.questions.length) throw new BadRequestException('Емтиханда сұрақтар жоқ');
      const records = gradeAnswerRecords(attemptId, dto.answers, snapshot);
      const score = Math.round(records.filter((answer) => answer.isCorrect).length / snapshot.questions.length * 100);
      const status = score >= snapshot.passScore ? 'FINISHED' : 'FAILED';
      const finishedAt = new Date();
      const changed = await tx.attempt.updateMany({
        where: { id: attemptId, userId, status: 'IN_PROGRESS', finishedAt: null },
        data: { score, status, finishedAt, submissionDigest: digest, reviewStatus: 'PENDING', draftAnswers: [], draftRevision: { increment: 1 } },
      });
      if (changed.count !== 1) throw this.closedError();
      await tx.answer.createMany({ data: records });
      const saved = { ...attempt, score, status, finishedAt, reviewStatus: 'PENDING', answers: records };
      return { result: this.submissionResult(saved, snapshot), attempt: saved, replayed: false };
    });
    if (!outcome) throw expiredAttemptError();
    if (!outcome.replayed) {
      const { attempt, result } = outcome;
      await this.notifyN8nExamSubmit({
        attemptId, userId, studentEmail: attempt.user.email, studentName: attempt.user.name,
        examId: attempt.examId, examTitle: attempt.examSnapshot.title, score: result.score, passed: result.passed,
        trustScore: attempt.trustScore, submittedAt: attempt.finishedAt.toISOString(),
      });
    }
    return outcome.result;
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
    const attempt = await serializable(this.prisma, async (tx) => {
      const include = { exam: { include: { questions: true } }, answers: true, events: { orderBy: { timestamp: 'asc' as const } } } as const;
      const found = await tx.attempt.findUnique({ where: { id }, include });
      if (!found) throw new NotFoundException('Талпыныс табылмады');
      if (found.userId !== userId) throw new ForbiddenException('Рұқсат жоқ');
      const current = await this.withSnapshot(tx, found);
      if (current.status === 'IN_PROGRESS' && !current.finishedAt && attemptExpired(current.startedAt, current.examSnapshot.duration)) {
        await finalizeExpiredAttempt(tx, current);
        return (await tx.attempt.findUnique({ where: { id }, include }))!;
      }
      return current;
    });
    const snapshot = snapshotForAttempt(attempt);
    const questions = new Map(publicExam(snapshot).questions.map((question) => [question.id, question]));
    return {
      ...safeAttempt(attempt), exam: { id: snapshot.id, title: snapshot.title, duration: snapshot.duration, passScore: snapshot.passScore },
      totalQuestions: snapshot.questions.length, correctCount: attempt.answers.filter((answer) => answer.isCorrect === true).length,
      answers: attempt.answers.map((answer) => ({ id: answer.id, questionId: answer.questionId, answer: answer.answer, isCorrect: answer.isCorrect, question: questions.get(answer.questionId) })),
      events: attempt.events,
    };
  }

  async getUserAttempts(userId: string) {
    const attempts = await serializable(this.prisma, async (tx) => {
      const rows = await tx.attempt.findMany({
        where: { userId }, include: { exam: { select: { id: true, courseId: true, title: true, duration: true, passScore: true } } }, orderBy: { startedAt: 'desc' },
      });
      const result = [];
      for (const row of rows) {
        if (row.status === 'IN_PROGRESS' && !row.finishedAt && attemptExpired(row.startedAt, snapshotDuration(row))) {
          const current = row.examSnapshot ? row : {
            ...row, exam: await tx.exam.findUnique({ where: { id: row.examId }, include: { questions: true } }),
          };
          result.push(await finalizeExpiredAttempt(tx, current));
        } else result.push(row);
      }
      return result;
    });
    return attempts.map(safeAttempt);
  }

  async getAllAttempts(actor: Actor, examId?: string, page = 1, limit = 50) {
    const where = { ...attemptScope(actor), ...(examId ? { examId } : {}) };
    const [attempts, total] = await Promise.all([
      this.prisma.attempt.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } }, exam: { select: { id: true, title: true } }, _count: { select: { events: true, evidences: true } } },
        orderBy: { startedAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.attempt.count({ where }),
    ]);
    return { data: attempts.map(safeAttempt), meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async flagAttempt(attemptId: string, actor: Actor) {
    return serializable(this.prisma, async (tx) => {
      const attempt = await assertProctorAccess(tx, attemptId, actor);
      if (attempt.reviewStatus !== 'PENDING') throw new ConflictException('Тексеру аяқталған. Қайта тексеру рәсімі қажет');
      const flagged = await tx.attempt.update({ where: { id: attemptId }, data: { flaggedAt: attempt.flaggedAt ?? new Date(), reviewStatus: 'PENDING' } });
      return safeAttempt(flagged);
    });
  }

  async getAttemptsByExam(examId: string, teacherId: string, role = 'TEACHER') {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId }, include: { course: true } });
    if (!exam) throw new NotFoundException('Емтихан табылмады');
    if (role !== 'ADMIN' && exam.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    const attempts = await this.prisma.attempt.findMany({
      where: { examId, status: { not: 'IN_PROGRESS' } },
      include: { user: { select: { id: true, name: true, email: true } }, _count: { select: { events: true } } },
      orderBy: { finishedAt: 'desc' },
    });
    return attempts.map(safeAttempt);
  }
}
