import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma, QuestionType } from '@prisma/client';
import { validateAnswerIds } from './attempt-policy';

export type SavedAnswer = { questionId: string; answer: string };
export type SnapshotQuestion = { id: string; text: string; type: QuestionType; options: string[] | null; answer: string };
export type ExamSnapshot = { id: string; courseId: string; title: string; duration: number; passScore: number; questions: SnapshotQuestion[] };

export function examSnapshot(exam: any): ExamSnapshot {
  if (!exam || !Number.isInteger(exam.duration) || exam.duration < 1 || !Number.isInteger(exam.passScore) || exam.passScore < 0 || exam.passScore > 100 || !Array.isArray(exam.questions)) {
    throw new BadRequestException('Емтихан сұрақтары жарамсыз');
  }
  return {
    id: exam.id, courseId: exam.courseId, title: exam.title, duration: exam.duration, passScore: exam.passScore,
    questions: exam.questions.map((question: any) => ({
      id: question.id, text: question.text, type: question.type,
      options: Array.isArray(question.options) ? question.options.filter((option: unknown) => typeof option === 'string') : null,
      answer: question.answer,
    })),
  };
}

export function snapshotForAttempt(attempt: any): ExamSnapshot {
  return examSnapshot(attempt.examSnapshot || attempt.exam);
}

export function snapshotDuration(attempt: any): number {
  return attempt.examSnapshot?.duration ?? attempt.exam.duration;
}

export function publicExam(snapshot: ExamSnapshot) {
  return {
    id: snapshot.id, courseId: snapshot.courseId, title: snapshot.title,
    duration: snapshot.duration, passScore: snapshot.passScore,
    questions: snapshot.questions.map(({ answer: _answer, ...question }) => question),
  };
}

// Use a whitelist: adding a persistence field must never make it public automatically.
export function safeAttempt(attempt: any): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of ['id', 'examId', 'userId', 'startedAt', 'finishedAt', 'score', 'trustScore', 'status',
    'reviewStatus', 'flaggedAt', 'reviewedAt', 'reviewedBy', 'reviewReason']) {
    if (attempt[key] !== undefined) result[key] = attempt[key];
  }
  if (attempt.exam) {
    const source = attempt.examSnapshot || attempt.exam;
    result.exam = Object.fromEntries(['id', 'title', 'duration', 'passScore', 'courseId'].filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
  }
  if (attempt.user) result.user = { id: attempt.user.id, name: attempt.user.name, email: attempt.user.email };
  if (attempt.appeal !== undefined) result.appealState = attempt.appeal?.state ?? null;
  if (attempt._count) result._count = attempt._count;
  return result;
}

export function draftForAttempt(attempt: any) {
  return {
    answers: Array.isArray(attempt.draftAnswers) ? attempt.draftAnswers.map(({ questionId, answer }: SavedAnswer) => ({ questionId, answer })) : [],
    revision: attempt.draftRevision ?? 0,
    updatedAt: attempt.draftUpdatedAt ?? null,
  };
}

export function normalizedAnswer(answer: string, type: QuestionType): string {
  const normalized = answer.trim().toLowerCase();
  if (type !== 'MULTIPLE_CHOICE') return normalized;
  let choices: string[];
  try {
    const parsed: unknown = JSON.parse(normalized);
    choices = Array.isArray(parsed) && parsed.every((value) => typeof value === 'string') ? parsed : normalized.split(',');
  } catch {
    choices = normalized.split(',');
  }
  return JSON.stringify(choices.map((value) => value.trim()).sort());
}

export function submissionDigest(answers: SavedAnswer[], snapshot: ExamSnapshot): string {
  const types = new Map(snapshot.questions.map((question) => [question.id, question.type]));
  const canonical = answers.map(({ questionId, answer }) => ({ questionId, answer: normalizedAnswer(answer, types.get(questionId)!) }))
    .sort((a, b) => a.questionId.localeCompare(b.questionId));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function gradeAnswerRecords(attemptId: string, answers: SavedAnswer[], snapshot: ExamSnapshot) {
  validateAnswerIds(answers, snapshot.questions);
  const questions = new Map(snapshot.questions.map((question) => [question.id, question]));
  return answers.map((answer) => {
    const question = questions.get(answer.questionId)!;
    return {
      attemptId, questionId: answer.questionId, answer: answer.answer,
      isCorrect: normalizedAnswer(answer.answer, question.type) === normalizedAnswer(question.answer, question.type),
    };
  });
}

/** Caller holds a serializable transaction. Late requests may only grade these saved drafts. */
export async function finalizeExpiredAttempt(tx: Prisma.TransactionClient, attempt: any) {
  const snapshot = snapshotForAttempt(attempt);
  const answers = draftForAttempt(attempt).answers;
  const records = gradeAnswerRecords(attempt.id, answers, snapshot);
  const score = snapshot.questions.length ? Math.round(records.filter((answer) => answer.isCorrect).length / snapshot.questions.length * 100) : 0;
  const status = snapshot.questions.length && score >= snapshot.passScore ? 'FINISHED' : 'FAILED';
  const finishedAt = new Date();
  const changed = await tx.attempt.updateMany({
    where: { id: attempt.id, finishedAt: null, status: { in: ['IN_PROGRESS', 'FLAGGED'] } },
    data: {
      score, status, finishedAt, reviewStatus: 'PENDING', submissionDigest: submissionDigest(answers, snapshot),
      examSnapshot: snapshot as unknown as Prisma.InputJsonValue, draftAnswers: [], draftRevision: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw new ConflictException({ code: 'ATTEMPT_CLOSED', message: 'Бұл талпыныс аяқталған' });
  await tx.answer.createMany({ data: records });
  return { ...attempt, score, status, finishedAt, reviewStatus: 'PENDING', answers: records, examSnapshot: snapshot };
}
