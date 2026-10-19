export interface DashboardEnrollment {
  id: string;
  courseId: string;
  completedAt: string | null;
  course: {
    id: string;
    title: string;
    level: string;
  };
  progress: number;
  completedLessons: number;
  totalLessons: number;
}

export interface DashboardAttempt {
  id: string;
  status: string;
  score: number | null;
  finishedAt: string | null;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  exam: {
    id: string;
    courseId: string;
    title: string;
    passScore: number;
  };
}

export interface DashboardCertificate {
  id: string;
  courseId: string;
  status: string;
}

export type DashboardResource<T> =
  | { status: 'loading'; data: null }
  | { status: 'success'; data: T }
  | { status: 'error'; data: null };

export type CertificateJourneyStage =
  | 'learning'
  | 'exam-requirements'
  | 'exam-in-progress'
  | 'exam-not-passed'
  | 'review-pending'
  | 'review-rejected'
  | 'certificate-not-issued'
  | 'exam-status-unknown'
  | 'certificate-valid'
  | 'certificate-revoked';

export function parseDashboardList<T>(value: unknown): T[] {
  if (!Array.isArray(value)) throw new Error('Dashboard list response must be an array');
  return value as T[];
}

export async function loadDashboardList<T>(request: () => Promise<{ data: unknown }>): Promise<DashboardResource<T[]>> {
  try {
    const response = await request();
    return { status: 'success', data: parseDashboardList<T>(response.data) };
  } catch {
    return { status: 'error', data: null };
  }
}

export function continueLearningHref(enrollment: DashboardEnrollment): string {
  return `/dashboard/courses/${encodeURIComponent(enrollment.course.id)}`;
}

export function certificateJourneyStage(
  enrollment: DashboardEnrollment,
  attempts: DashboardAttempt[],
  certificates: DashboardCertificate[],
): CertificateJourneyStage {
  const certificate = certificates.find((item) => item.courseId === enrollment.courseId);
  if (certificate?.status === 'VALID') return 'certificate-valid';
  if (certificate?.status === 'REVOKED') return 'certificate-revoked';

  const attempt = attempts.find((item) => item.exam.courseId === enrollment.courseId);
  if (!attempt) return enrollment.progress >= 100 ? 'exam-requirements' : 'learning';
  if (attempt.status === 'IN_PROGRESS') return 'exam-in-progress';
  if (attempt.status === 'FAILED') return 'exam-not-passed';
  if (!attempt.finishedAt || !['FINISHED', 'FLAGGED'].includes(attempt.status)) return 'exam-status-unknown';
  if (attempt.reviewStatus === 'PENDING') return 'review-pending';
  if (attempt.reviewStatus === 'REJECTED') return 'review-rejected';
  return 'certificate-not-issued';
}
