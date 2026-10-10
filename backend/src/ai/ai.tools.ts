import { PrismaService } from '../prisma/prisma.service';

const tool = (name: string, description: string, course = false) => ({
  type: 'function', function: { name, description, parameters: {
    type: 'object', properties: course ? { courseId: { type: 'string', description: 'Exact ID from my_courses; never guess it' } } : {},
    required: course ? ['courseId'] : [], additionalProperties: false,
  } },
});

export const AI_TOOLS = [
  tool('my_courses', 'List up to 10 courses the authenticated user is enrolled in.'),
  tool('my_progress', 'Read the authenticated user completion count in an enrolled course.', true),
  tool('course_outline', 'Read titles and ordering only for an enrolled or teacher-owned course, without answers or locked lesson content.', true),
  tool('my_results', 'Read up to 5 completed exam results of the authenticated user, score and review are distinct.'),
  tool('my_certificates', 'Read up to 5 certificate metadata records of the authenticated user, including revocation status.'),
];
const clip = (value: string | null | undefined, length = 160) => (value ?? '').slice(0, length);

export class AiReadTools {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string, name: string, args: unknown): Promise<unknown> {
    const needsCourse = name === 'course_outline' || name === 'my_progress';
    if (!AI_TOOLS.some(t => t.function.name === name)) return { error: 'TOOL_NOT_ALLOWED' };
    if (!args || typeof args !== 'object' || Array.isArray(args)) return { error: 'INVALID_ARGUMENTS' };
    const input = args as Record<string, unknown>;
    if (Object.keys(input).some(key => !needsCourse || key !== 'courseId') ||
      (needsCourse && (typeof input.courseId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.courseId)))) return { error: 'INVALID_ARGUMENTS' };
    // Every query is projected and bound to authenticated identity. Role claims,
    // userId overrides, SQL, URLs and lesson answers are not accepted arguments.
    if (name === 'my_courses') {
      const rows = await this.prisma.enrollment.findMany({ where: { userId, accessStatus: 'ACTIVE' }, take: 10,
        orderBy: [{ enrolledAt: 'desc' }, { id: 'asc' }], select: {
          completedAt: true, course: { select: { id: true, title: true, level: true } },
        } });
      return { courses: rows.map(r => ({ ...r.course, title: clip(r.course.title), completedAt: r.completedAt })), limit: 10 };
    }
    if (needsCourse) {
      const courseId = input.courseId as string;
      const access = await this.prisma.course.findFirst({ where: { id: courseId,
        OR: [{ enrollments: { some: { userId, accessStatus: 'ACTIVE' } } }, ...(name === 'course_outline' ? [{ teacherId: userId }] : [])],
      }, select: { id: true, title: true } });
      if (!access) return { error: 'NOT_FOUND_OR_FORBIDDEN' };
      const scope = { OR: [{ courseId }, { module: { courseId } }] };
      if (name === 'my_progress') {
        const [total, completed] = await Promise.all([
          this.prisma.lesson.count({ where: scope }),
          this.prisma.lessonProgress.count({ where: { userId, courseId, lesson: scope,
            OR: [{ lesson: { assignmentAnswer: null } }, { lesson: { assignmentAnswer: '' } }, { completionSource: 'ASSIGNMENT' }],
          } }),
        ]);
        return { courseId, course: clip(access.title), completedLessons: completed, totalLessons: total };
      }
      const lessons = await this.prisma.lesson.findMany({ where: scope,
        orderBy: [{ module: { order: 'asc' } }, { order: 'asc' }, { id: 'asc' }], take: 20,
        select: { id: true, title: true, order: true, module: { select: { id: true, title: true, order: true } } },
      });
      return { courseId, title: clip(access.title), lessons: lessons.map(l => ({ id: l.id, title: clip(l.title), order: l.order,
        module: l.module ? { ...l.module, title: clip(l.module.title) } : null })), limit: 20 };
    }
    if (name === 'my_results') {
      const rows = await this.prisma.attempt.findMany({ where: { userId, finishedAt: { not: null } },
        orderBy: [{ finishedAt: 'desc' }, { id: 'asc' }], take: 5,
        select: { id: true, score: true, status: true, reviewStatus: true, finishedAt: true, exam: { select: { title: true } } },
      });
      return { results: rows.map(r => ({ ...r, exam: { title: clip(r.exam.title) } })), limit: 5 };
    }
    const rows = await this.prisma.certificate.findMany({ where: { userId },
      orderBy: [{ issuedAt: 'desc' }, { id: 'asc' }], take: 5,
      select: { id: true, issuedAt: true, status: true, revokedAt: true,
        courseTitle: true, recipientName: true, issuerName: true, snapshotStatus: true },
    });
    return { certificates: rows.map(r => ({ ...r,
      courseTitle: r.courseTitle === null ? null : clip(r.courseTitle),
      recipientName: r.recipientName === null ? null : clip(r.recipientName),
      issuerName: r.issuerName === null ? null : clip(r.issuerName),
    })), limit: 5 };
  }
}
