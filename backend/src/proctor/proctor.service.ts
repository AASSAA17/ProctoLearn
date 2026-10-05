import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { attemptExpired, expiredAttemptError } from '../attempts/attempt-policy';
import { serializable } from '../prisma/serializable';
import { AppealAttemptDto, ResolveAppealDto, ReviewAttemptDto, TRUST_SCORE_DEDUCTIONS } from './proctor.dto';
import { Actor, assertProctorAccess } from './proctor-access';
import { CertificatesService } from '../certificates/certificates.service';
import { safeAttempt, snapshotDuration } from '../attempts/attempt-state';
import { notifyUser, recordAudit } from '../operations/operation-events';
import { Prisma } from '@prisma/client';
import { eventLimitError, MAX_PROCTOR_EVENTS, PROCTOR_EVENTS_PER_MINUTE, validateEventMetadata } from './proctor-event-policy';
import { evidenceMetadata } from '../evidence/evidence-retention-policy';

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
    validateEventMetadata(metadata);
    if (!Object.hasOwn(TRUST_SCORE_DEDUCTIONS, type)) throw new BadRequestException('Оқиға түрі жарамсыз');
    return serializable(this.prisma, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { id: attemptId }, include: { exam: true } });
      if (!attempt) throw new NotFoundException('Талпыныс табылмады');
      if (attempt.userId !== userId) throw new ForbiddenException('Рұқсат жоқ');
      if (attempt.status !== 'IN_PROGRESS') throw new BadRequestException('Бұл талпыныс аяқталған');
      if (attemptExpired(attempt.startedAt, snapshotDuration(attempt))) throw expiredAttemptError();

      // Serializable count + insert + attempt update makes the limits hold
      // across concurrent sockets, replicas and process restarts.
      const total = await tx.proctorEvent.count({ where: { attemptId } });
      const recent = await tx.proctorEvent.count({ where: { attemptId, timestamp: { gte: new Date(Date.now() - 60_000) } } });
      if (total >= MAX_PROCTOR_EVENTS || recent >= PROCTOR_EVENTS_PER_MINUTE) throw eventLimitError();

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
      await tx.attemptReview.create({ data: { attemptId, reviewerId: actor.id, decision: dto.decision, reason, source: 'INITIAL' } });
      // Eligibility and issuance use the same transaction as the review. Any
      // missing evidence or certificate failure rolls back the entire decision.
      const certificate = dto.decision === 'APPROVED'
        ? await this.certificatesService.issueForAttempt(attemptId, tx)
        : null;
      await notifyUser(tx, { userId: attempt.userId, type: 'REVIEW_DECIDED', title: 'Тексеру аяқталды', body: dto.decision === 'APPROVED' ? 'Емтихан нәтижесі мақұлданды. Шешім мен сертификатты нәтижелер бөлімінен ашыңыз.' : 'Тексеру нәтижесі қабылданбады. Себебін оқып, қажет болса апелляция беруге болады.', targetPath: `/dashboard/my-attempts/${attemptId}`, dedupeKey: `review:${attemptId}:initial` });
      return this.reviewResult({ ...attempt, reviewStatus: dto.decision, reviewedAt, reviewedBy: actor.id, reviewReason: reason }, certificate);
    });
  }

  async getAppeal(attemptId: string, actor: Actor) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');
    if (attempt.userId !== actor.id) await assertProctorAccess(this.prisma, attemptId, actor);
    const [appeal, history] = await Promise.all([
      this.prisma.attemptAppeal.findUnique({ where: { attemptId } }),
      this.prisma.attemptReview.findMany({ where: { attemptId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    ]);
    return { appeal, history };
  }

  async createAppeal(attemptId: string, actor: Actor, dto: AppealAttemptDto) {
    const reason = this.appealReason(dto.reason);
    return serializable(this.prisma, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { id: attemptId } });
      if (!attempt) throw new NotFoundException('Талпыныс табылмады');
      if (attempt.userId !== actor.id) throw new ForbiddenException('Тек өз талпынысыңызға апелляция беруге болады');
      const existing = await tx.attemptAppeal.findUnique({ where: { attemptId } });
      if (existing) {
        if (existing.reason !== reason) throw new ConflictException('Бір талпынысқа бір ғана апелляция беріледі');
        return existing;
      }
      if (!attempt.finishedAt || !['FINISHED', 'FAILED'].includes(attempt.status) || attempt.reviewStatus !== 'REJECTED') {
        throw new ConflictException('Апелляция тек аяқталған және қабылданбаған талпынысқа беріледі');
      }
      // A write to the attempt serializes concurrent appeal creation and review.
      const changed = await tx.attempt.updateMany({ where: { id: attemptId, reviewStatus: 'REJECTED' }, data: { reviewStatus: 'REJECTED' } });
      if (changed.count !== 1) throw new ConflictException('Тексеру шешімі өзгерді');
      const appeal = await tx.attemptAppeal.create({ data: { attemptId, reason } });
      const expiresAt = new Date(appeal.createdAt.getTime() + 24 * 60 * 60_000);
      await tx.recordingUpload.updateMany({
        where: { attemptId, state: { in: ['OPEN', 'FINALIZING'] }, expiresAt: { lt: expiresAt } },
        data: { expiresAt },
      });
      await notifyUser(tx, { userId: attempt.userId, type: 'APPEAL_RECEIVED', title: 'Апелляция қабылданды', body: 'Өтінішіңіз сақталды. Шешім осы бөлімде көрсетіледі.', targetPath: `/dashboard/my-attempts/${attemptId}`, dedupeKey: `appeal:${appeal.id}:received` });
      return appeal;
    });
  }

  async resolveAppeal(attemptId: string, actor: Actor, dto: ResolveAppealDto) {
    const reason = this.appealReason(dto.reason);
    if (!['UPHELD', 'OVERTURNED'].includes(dto.decision)) throw new BadRequestException('Апелляция шешімі жарамсыз');
    return serializable(this.prisma, async (tx) => {
      const attempt = await assertProctorAccess(tx, attemptId, actor);
      if (attempt.userId === actor.id) throw new ForbiddenException('Өз апелляцияңызды тексеруге болмайды');
      const initialReview = await tx.attemptReview.findFirst({ where: { attemptId, source: 'INITIAL' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
      const originalReviewer = initialReview?.reviewerId ?? attempt.reviewedBy;
      if (!originalReviewer || originalReviewer === actor.id) throw new ForbiddenException('Апелляцияны басқа проктор тексеруі керек');
      const appeal = await tx.attemptAppeal.findUnique({ where: { attemptId } });
      if (!appeal) throw new NotFoundException('Апелляция табылмады');
      if (appeal.state !== 'OPEN') {
        if (appeal.state !== dto.decision || appeal.response !== reason) throw new ConflictException('Апелляция шешімі бұрын сақталған');
        const certificate = attempt.reviewStatus === 'APPROVED' ? await this.certificatesService.findForAttempt(attemptId, tx) : null;
        return { appeal, ...this.reviewResult(attempt, certificate) };
      }
      if (!attempt.finishedAt || !['FINISHED', 'FAILED'].includes(attempt.status) || attempt.reviewStatus !== 'REJECTED') {
        throw new ConflictException('Апелляция үшін аяқталған және қабылданбаған талпыныс қажет');
      }
      // Preserve the original reviewer for legacy records before reviewedBy can
      // change on an overturned appeal, including idempotent response retries.
      if (!initialReview) await tx.attemptReview.create({ data: {
        attemptId, reviewerId: originalReviewer, decision: 'REJECTED', source: 'INITIAL',
        reason: attempt.reviewReason ?? 'Legacy review', createdAt: attempt.reviewedAt ?? attempt.finishedAt,
      } });
      const decidedAt = new Date();
      const changed = await tx.attemptAppeal.updateMany({
        where: { id: appeal.id, state: 'OPEN' },
        data: { state: dto.decision, response: reason, decidedAt, decidedBy: actor.id },
      });
      if (changed.count !== 1) throw new ConflictException('Апелляцияны басқа проктор тексерді');
      let reviewedAttempt = attempt;
      let certificate: { id: string } | null = null;
      if (dto.decision === 'OVERTURNED') {
        const review = await tx.attempt.updateMany({
          where: { id: attemptId, reviewStatus: 'REJECTED' },
          data: { reviewStatus: 'APPROVED', reviewedAt: decidedAt, reviewedBy: actor.id, reviewReason: reason },
        });
        if (review.count !== 1) throw new ConflictException('Тексеру шешімі өзгерді');
        certificate = await this.certificatesService.issueForAttempt(attemptId, tx);
        reviewedAttempt = { ...attempt, reviewStatus: 'APPROVED', reviewedAt: decidedAt, reviewedBy: actor.id, reviewReason: reason };
      }
      await tx.attemptReview.create({ data: { attemptId, reviewerId: actor.id, decision: dto.decision, reason, source: 'APPEAL' } });
      await notifyUser(tx, { userId: attempt.userId, type: 'APPEAL_DECIDED', title: 'Апелляция қаралды', body: dto.decision === 'OVERTURNED' ? 'Бастапқы шешім өзгертілді. Нәтижені ашып, жаңа шешімді оқыңыз.' : 'Бастапқы шешім күшінде қалды. Толық жауап нәтижелер бөлімінде.', targetPath: `/dashboard/my-attempts/${attemptId}`, dedupeKey: `appeal:${appeal.id}:decided` });
      return { appeal: { ...appeal, state: dto.decision, response: reason, decidedAt, decidedBy: actor.id }, ...this.reviewResult(reviewedAttempt, certificate) };
    });
  }

  private appealReason(value: string) {
    const reason = typeof value === 'string' ? value.trim() : '';
    if (reason.length < 3 || reason.length > 2000) throw new BadRequestException('Себеп 3–2000 таңба болуы керек');
    return reason;
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
        appeal: true,
        reviews: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        recordingUploads: { orderBy: { createdAt: 'asc' }, select: {
          id: true, kind: true, state: true, bytes: true, interrupted: true,
          expectedChunks: true, createdAt: true, expiresAt: true, evidenceId: true,
        } },
      },
    });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');
    return { ...safeAttempt(attempt), events: attempt.events, evidences: attempt.evidences.map(evidenceMetadata),
      evidenceLegalHold: attempt.evidenceLegalHold,
      ...(actor.role === 'ADMIN' ? { evidenceHoldReason: attempt.evidenceHoldReason, evidenceHoldAt: attempt.evidenceHoldAt } : {}),
      appeal: attempt.appeal, history: attempt.reviews, recordingUploads: attempt.recordingUploads };
  }

  private async assertAssignmentManager(examId: string, actor: Actor, db: Prisma.TransactionClient = this.prisma) {
    const exam = await db.exam.findUnique({ where: { id: examId }, include: { course: true } });
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
    return serializable(this.prisma, async tx => {
      await this.assertAssignmentManager(examId, actor, tx);
      const user = await tx.user.findUnique({ where: { id: proctorId }, select: { role: true } });
      if (user?.role !== 'PROCTOR') throw new BadRequestException('Проктор рөлі қажет');
      const existing = await tx.examProctor.findUnique({ where: { examId_proctorId: { examId, proctorId } } });
      const assignment = await tx.examProctor.upsert({ where: { examId_proctorId: { examId, proctorId } }, create: { examId, proctorId }, update: {} });
      if (!existing) await recordAudit(tx, { actorId: actor.id, action: 'PROCTOR_ASSIGNED', targetType: 'EXAM', targetId: examId, metadata: { proctorId } });
      return assignment;
    });
  }

  async unassign(examId: string, proctorId: string, actor: Actor) {
    return serializable(this.prisma, async tx => {
      await this.assertAssignmentManager(examId, actor, tx);
      const changed = await tx.examProctor.deleteMany({ where: { examId, proctorId } });
      if (changed.count) await recordAudit(tx, { actorId: actor.id, action: 'PROCTOR_REVOKED', targetType: 'EXAM', targetId: examId, metadata: { proctorId } });
      return { success: true };
    });
  }
}
