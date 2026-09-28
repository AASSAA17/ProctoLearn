import type { DraftAnswer, ExamDraft } from './exam-draft';

export function isClosedExamError(error: unknown): boolean {
  const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
  return ['EXAM_EXPIRED', 'ATTEMPT_CLOSED', 'SUBMISSION_CONFLICT'].includes(code ?? '');
}

/** At the deadline, a conflicted tab can submit only the latest server snapshot.
 * Stop capture immediately, including when the server is unavailable or already closed. */
export async function finishExpiredConflict<T>(
  readDraft: () => Promise<ExamDraft>,
  submitDraft: (answers: DraftAnswer[]) => Promise<T>,
  stopCapture: () => Promise<void>,
): Promise<T> {
  const stopped = stopCapture();
  // Attach a rejection handler immediately while the independent network request runs.
  const recording = stopped.then(() => ({ error: undefined }), (error: unknown) => ({ error }));
  try {
    const draft = await readDraft();
    return await submitDraft(draft.answers);
  } finally {
    const { error } = await recording;
    if (error) throw error;
  }
}
