type ProgressApi = {
  get(path: string): Promise<{ data: { id: string; completed: boolean }[] }>;
  post(path: string): Promise<unknown>;
};

type ProgressStep = { id: string; type: string };
type ProgressLesson = { id: string; steps?: ProgressStep[]; hasAssignment?: boolean };

/** Use saved submissions as the source of truth before completing a lesson. */
export async function saveLearningProgress(api: ProgressApi, courseId: string, lesson: ProgressLesson, step: ProgressStep) {
  if (step.type !== 'TASK') await api.post(`/steps/${step.id}/complete`);
  const { data } = await api.get(`/submissions/lesson/${lesson.id}/progress`);
  const expected = new Set((lesson.steps ?? []).map(({ id }) => id));
  const completedStepIds = [...new Set(data.filter(({ id, completed }) => completed && expected.has(id)).map(({ id }) => id))];
  const lessonCompleted = expected.size > 0 && completedStepIds.length === expected.size && !lesson.hasAssignment;
  if (lessonCompleted) await api.post(`/courses/${courseId}/lessons/${lesson.id}/complete`);
  return { completedStepIds, lessonCompleted };
}
