import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

export type Actor = { id: string; role: Role | string };

export function attemptScope(actor: Actor): Prisma.AttemptWhereInput {
  if (actor.role === 'ADMIN') return {};
  if (actor.role === 'TEACHER') return { exam: { course: { teacherId: actor.id } } };
  if (actor.role === 'PROCTOR') return { exam: { proctorAssignments: { some: { proctorId: actor.id } } } };
  throw new ForbiddenException('Рұқсат жоқ');
}

export async function assertProctorAccess(db: Pick<Prisma.TransactionClient, 'attempt' | 'examProctor'>, attemptId: string, actor: Actor) {
  if (!['ADMIN', 'PROCTOR'].includes(actor.role)) throw new ForbiddenException('Рұқсат жоқ');
  const attempt = await db.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new NotFoundException('Талпыныс табылмады');
  if (actor.role !== 'ADMIN') {
    const assignment = await db.examProctor.findUnique({ where: { examId_proctorId: { examId: attempt.examId, proctorId: actor.id } } });
    if (!assignment) throw new ForbiddenException('Бұл емтиханға проктор тағайындалмаған');
  }
  return attempt;
}
