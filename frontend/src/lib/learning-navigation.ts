export type LearningNavStep = { id: string; type: 'VIDEO' | 'TEXT' | 'TASK'; order: number };
export type LearningNavLesson = { id: string; title: string; order: number; steps: LearningNavStep[] };
export type LearningNavModule = { id: string; title: string; order: number; lessons: LearningNavLesson[] };

export type LearningNavItem = {
  moduleId: string;
  moduleTitle: string;
  lessonId: string;
  lessonTitle: string;
  stepId: string;
  stepOrder: number;
  stepType: LearningNavStep['type'];
};

export function buildLearningNavList(modules: LearningNavModule[]): LearningNavItem[] {
  return [...modules]
    .sort((a, b) => a.order - b.order)
    .flatMap((module) => [...module.lessons]
      .sort((a, b) => a.order - b.order)
      .flatMap((lesson) => [...lesson.steps]
        .sort((a, b) => a.order - b.order)
        .map((step) => ({
          moduleId: module.id,
          moduleTitle: module.title,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          stepId: step.id,
          stepOrder: step.order,
          stepType: step.type,
        }))));
}

export function chooseLearningStep(
  items: LearningNavItem[],
  requestedStepId: string | null,
  completedStepIds: ReadonlySet<string>,
): string | null {
  if (requestedStepId && items.some((item) => item.stepId === requestedStepId)) return requestedStepId;
  return items.find((item) => !completedStepIds.has(item.stepId))?.stepId ?? items[0]?.stepId ?? null;
}

export function countCompletedLearningSteps(items: LearningNavItem[], completedStepIds: ReadonlySet<string>): number {
  return items.reduce((total, item) => total + Number(completedStepIds.has(item.stepId)), 0);
}
