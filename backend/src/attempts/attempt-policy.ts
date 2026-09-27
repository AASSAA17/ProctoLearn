import { BadRequestException } from '@nestjs/common';

// A small, fixed allowance for the automatic submission's network round-trip.
// This is server policy, never a value supplied by the browser.
export const SUBMISSION_GRACE_MS = 5_000;

export function attemptDeadline(startedAt: Date, durationMinutes: number): number {
  return startedAt.getTime() + durationMinutes * 60_000;
}

export function attemptExpired(startedAt: Date, durationMinutes: number, now = Date.now()): boolean {
  return now > attemptDeadline(startedAt, durationMinutes) + SUBMISSION_GRACE_MS;
}

export function expiredAttemptError(): BadRequestException {
  return new BadRequestException({ code: 'EXAM_EXPIRED', message: 'Емтихан уақыты аяқталды' });
}

export function validateAnswerIds(
  answers: { questionId: string }[],
  questions: { id: string }[],
): void {
  const allowed = new Set(questions.map((q) => q.id));
  const seen = new Set<string>();
  for (const answer of answers) {
    if (!allowed.has(answer.questionId)) {
      throw new BadRequestException('Сұрақ бұл емтиханға жатпайды');
    }
    if (seen.has(answer.questionId)) {
      throw new BadRequestException('Бір сұраққа бір ғана жауап жіберіңіз');
    }
    seen.add(answer.questionId);
  }
}
