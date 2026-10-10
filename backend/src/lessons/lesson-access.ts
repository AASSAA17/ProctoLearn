import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type LessonViewer = { id: string; role: string };

export function canManageCourse(course: { teacherId: string }, viewer?: LessonViewer): boolean {
  return !!viewer && (viewer.role === 'ADMIN' || (viewer.role === 'TEACHER' && course.teacherId === viewer.id));
}

// A task may contain nested answer annotations (for example in its options).
// Keep grading keys server-side even when authors supply additional JSON fields.
function withoutAnswers(value: any): any {
  if (Array.isArray(value)) return value.map(withoutAnswers);
  if (!value || typeof value !== 'object') return value;
  const privateKeys = new Set(['correctAnswer', 'answer', 'assignmentAnswer', 'explanation', 'isCorrect']);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !privateKeys.has(key))
    .map(([key, item]) => [key, withoutAnswers(item)]));
}

export function sanitizeStep(step: any, revealAnswers = false): any {
  if (revealAnswers || step.type !== 'TASK') return step;
  return { ...step, content: withoutAnswers(step.content) };
}

export function sanitizeLesson(lesson: any, revealAnswers = false): any {
  const { course, module, ...result } = lesson;
  if (!revealAnswers) delete result.assignmentAnswer;
  result.hasAssignment = !!lesson.assignmentAnswer;
  if (result.steps) result.steps = result.steps.map((step: any) => sanitizeStep(step, revealAnswers));
  return result;
}

/** Public curriculum contains navigation metadata, never protected lesson material. */
export function lessonSummary(lesson: any): any {
  const { id, courseId, moduleId, title, order, createdAt } = lesson;
  return {
    id, courseId, moduleId, title, order, createdAt,
    hasAssignment: !!lesson.assignmentAnswer,
    ...(lesson.steps ? { steps: lesson.steps.map(({ id, type, order }: any) => ({ id, type, order })) } : {}),
  };
}

export function lessonCourse(lesson: any, expectedCourseId?: string): any {
  const course = lesson.course ?? lesson.module?.course;
  if (!course || (expectedCourseId && course.id !== expectedCourseId)) {
    throw new NotFoundException('Сабақ табылмады');
  }
  return course;
}

export function assertCourseManager(course: { teacherId: string }, viewer: LessonViewer): void {
  if (!canManageCourse(course, viewer)) throw new ForbiddenException('Рұқсат жоқ');
}

export async function assertCourseReader(prisma: PrismaService, course: any, viewer: LessonViewer): Promise<boolean> {
  if (canManageCourse(course, viewer)) return true;
  if (!viewer?.id) throw new ForbiddenException('Курсқа тіркеліңіз');
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: viewer.id, courseId: course.id } },
  });
  if (!enrollment || enrollment.accessStatus === 'WITHDRAWN') throw new ForbiddenException('Курсқа тіркеліңіз');
  return false;
}

export const lessonCourseInclude = { course: true, module: { include: { course: true } } } as const;
