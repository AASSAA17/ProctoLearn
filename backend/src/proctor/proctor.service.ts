import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { attemptExpired, expiredAttemptError } from '../attempts/attempt-policy';
import { serializable } from '../prisma/serializable';
import { TRUST_SCORE_DEDUCTIONS } from './proctor.dto';
import { Actor, assertProctorAccess } from './proctor-access';

@Injectable()
export class ProctorService {
  constructor(
    private prisma: PrismaService,
  ) {}

  async recordEvent(
    attemptId: string,
    userId: string,
    type: keyof typeof TRUST_SCORE_DEDUCTIONS,
    metadata?: Record<string, any>,
  ) {
    if (!Object.hasOwn(TRUST_SCORE_DEDUCTIONS, type)) throw new BadRequestException('Оқиға түрі жарамсыз');
    return serializable(this.prisma, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { id: attemptId }, include: { exam: true } });
      if (!attempt) throw new NotFoundException('Талпыныс табылмады');
      if (attempt.userId !== userId) throw new ForbiddenException('Рұқсат жоқ');
      if (attempt.status !== 'IN_PROGRESS') throw new BadRequestException('Бұл талпыныс аяқталған');
      if (attemptExpired(attempt.startedAt, attempt.exam.duration)) throw expiredAttemptError();

      const event = await tx.proctorEvent.create({
        data: { attemptId, type, metadata },
      });

      const newTrustScore = Math.max(0, attempt.trustScore - TRUST_SCORE_DEDUCTIONS[type]);
      const updatedAttempt = await tx.attempt.update({
        where: { id: attemptId },
        data: {
          trustScore: newTrustScore,
          status: newTrustScore === 0 ? 'FLAGGED' : attempt.status,
        },
      });

      return { event, trustScore: updatedAttempt.trustScore };
    });
  }

  async assertSessionAccess(attemptId: string, userId: string, role: string, asProctor: boolean) {
    if (asProctor) return assertProctorAccess(this.prisma, attemptId, { id: userId, role });
    if (asProctor && !['PROCTOR', 'ADMIN'].includes(role)) throw new ForbiddenException('Рұқсат жоқ');
    if (!asProctor && role !== 'STUDENT') throw new ForbiddenException('Рұқсат жоқ');
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');
    if (!asProctor && attempt.userId !== userId) throw new ForbiddenException('Рұқсат жоқ');
    return attempt;
  }

  async endSession(attemptId: string, userId: string, role: string) {
    const attempt = await this.assertSessionAccess(attemptId, userId, role, false);
    if (attempt.status === 'IN_PROGRESS') throw new BadRequestException('Алдымен жауаптарды жіберіңіз');

    return { trustScore: attempt.trustScore, status: attempt.status };
  }

  async getSessionSummary(attemptId: string, actor: Actor) {
    await assertProctorAccess(this.prisma, attemptId, actor);
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        events: { orderBy: { timestamp: 'asc' } },
        evidences: { orderBy: { createdAt: 'asc' } },
        user: { select: { id: true, name: true, email: true } },
        exam: { select: { id: true, title: true } },
      },
    });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');
    return attempt;
  }

  private async assertAssignmentManager(examId: string, actor: Actor) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId }, include: { course: true } });
    if (!exam) throw new NotFoundException('Емтихан табылмады');
    if (actor.role !== 'ADMIN' && !(actor.role === 'TEACHER' && exam.course.teacherId === actor.id)) throw new ForbiddenException('Рұқсат жоқ');
  }

  async listAssignments(examId: string, actor: Actor) {
    await this.assertAssignmentManager(examId, actor);
    return this.prisma.examProctor.findMany({ where: { examId }, include: { proctor: { select: { id: true, name: true } } } });
  }

  async listCandidates(examId: string, actor: Actor) {
    await this.assertAssignmentManager(examId, actor);
    return this.prisma.user.findMany({
      where: { role: 'PROCTOR' },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 100,
    });
  }

  async assign(examId: string, proctorId: string, actor: Actor) {
    await this.assertAssignmentManager(examId, actor);
    const user = await this.prisma.user.findUnique({ where: { id: proctorId }, select: { role: true } });
    if (user?.role !== 'PROCTOR') throw new BadRequestException('Проктор рөлі қажет');
    return this.prisma.examProctor.upsert({ where: { examId_proctorId: { examId, proctorId } }, create: { examId, proctorId }, update: {} });
  }

  async unassign(examId: string, proctorId: string, actor: Actor) {
    await this.assertAssignmentManager(examId, actor);
    await this.prisma.examProctor.deleteMany({ where: { examId, proctorId } });
    return { success: true };
  }
}
