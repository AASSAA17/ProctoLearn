import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { attemptExpired, expiredAttemptError } from '../attempts/attempt-policy';
import { serializable } from '../prisma/serializable';
import { ReviewAttemptDto, TRUST_SCORE_DEDUCTIONS } from './proctor.dto';
import { Actor, assertProctorAccess } from './proctor-access';
import { CertificatesService } from '../certificates/certificates.service';
import { safeAttempt, snapshotDuration } from '../attempts/attempt-state';

@Injectable()
export class ProctorService {
  constructor(
    private prisma: PrismaService,
    private certificatesService: CertificatesService,
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
      if (attemptExpired(attempt.startedAt, snapshotDuration(attempt))) throw expiredAttemptError();

      const event = await tx.proctorEvent.create({
        data: { attemptId, type, metadata },
      });

      const newTrustScore = Math.max(0, attempt.trustScore - TRUST_SCORE_DEDUCTIONS[type]);
      const updatedAttempt = await tx.attempt.update({
        where: { id: attemptId },
        data: {
          trustScore: newTrustScore,
          ...(newTrustScore === 0 && !attempt.flaggedAt ? { flaggedAt: new Date() } : {}),
        },
      });

      return { event, trustScore: updatedAttempt.trustScore, flaggedAt: updatedAttempt.flaggedAt };
    });
  }

  async assertSessionAccess(attemptId: string, userId: string, role: string, asProctor: boolean) {
    if (asProctor) return assertProctorAccess(this.prisma, attemptId, { id: userId, role });
    if (role !== 'STUDENT') throw new ForbiddenException('Рұқсат жоқ');
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');
    if (attempt.userId !== userId) throw new ForbiddenException('Рұқсат жоқ');
    return safeAttempt(attempt);
  }

  async reviewAttempt(attemptId: string, actor: Actor, dto: ReviewAttemptDto) {
    const reason = typeof dto.reason === 'string' ? dto.reason.trim() : '';
    if (!['APPROVED', 'REJECTED'].includes(dto.decision) || reason.length < 3 || reason.length > 2000) {
      throw new BadRequestException('Тексеру шешімі мен себебі қажет');
    }
    return serializable(this.prisma, async (tx) => {
      const attempt = await assertProctorAccess(tx, attemptId, actor);
      if (attempt.userId === actor.id) throw new ForbiddenException('Өз талпынысыңызды тексеруге болмайды');
      if (!attempt.finishedAt || !['FINISHED', 'FAILED'].includes(attempt.status)) {
        throw new ConflictException('Алдымен студент емтиханды аяқтауы керек');
      }
      if (attempt.reviewStatus !== 'PENDING') {
        if (attempt.reviewStatus !== dto.decision || attempt.reviewReason !== reason) {
          throw new ConflictException('Тексеру шешімі бұрын сақталған');
        }
        const certificate = attempt.reviewStatus === 'APPROVED'
          ? await this.certificatesService.findForAttempt(attemptId, tx)
          : null;
        return this.reviewResult(attempt, certificate);
      }
      const reviewedAt = new Date();
      const changed = await tx.attempt.updateMany({
        where: { id: attemptId, reviewStatus: 'PENDING', finishedAt: { not: null }, status: { in: ['FINISHED', 'FAILED'] } },
        data: { reviewStatus: dto.decision, reviewedAt, reviewedBy: actor.id, reviewReason: reason },
      });
      if (changed.count !== 1) throw new ConflictException('Талпынысты басқа проктор тексерді');
      // Eligibility and issuance use the same transaction as the review. Any
      // missing evidence or certificate failure rolls back the entire decision.
      const certificate = dto.decision === 'APPROVED'
        ? await this.certificatesService.issueForAttempt(attemptId, tx)
        : null;
      return this.reviewResult({ ...attempt, reviewStatus: dto.decision, reviewedAt, reviewedBy: actor.id, reviewReason: reason }, certificate);
    });
  }

  private reviewResult(attempt: { id: string; status: string; reviewStatus: string; reviewedAt: Date | null; reviewedBy: string | null; reviewReason: string | null }, certificate: { id: string } | null) {
    return {
      attemptId: attempt.id, status: attempt.status, reviewStatus: attempt.reviewStatus,
      reviewedAt: attempt.reviewedAt, reviewedBy: attempt.reviewedBy, reviewReason: attempt.reviewReason,
      certificatePending: false, certificateIssued: !!certificate,
      ...(certificate ? { certificateId: certificate.id } : {}),
    };
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
    return { ...safeAttempt(attempt), events: attempt.events, evidences: attempt.evidences };
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
