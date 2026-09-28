import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { serializable } from '../prisma/serializable';
import { MinioService } from '../minio/minio.service';
import { Actor } from '../proctor/proctor-access';
import { recordAudit } from '../operations/operation-events';
import { retentionDays, retentionEligibility } from './evidence-retention-policy';

// Shared with the operator's consistent backup. Pending tombstones make a backup fail closed.
export const EVIDENCE_MAINTENANCE_LOCK = 71083208;
const includeEvidence = { attempt: { select: {
  id: true, finishedAt: true, status: true, reviewStatus: true, reviewedAt: true, evidenceLegalHold: true,
  appeal: { select: { state: true, decidedAt: true } },
  recordingUploads: { select: { state: true, finalizeLeaseUntil: true, _count: { select: { chunks: true } } } },
} }, deletionJob: true } as const;
const LEASE_MS = 5 * 60_000;

@Injectable()
export class EvidenceRetentionService {
  constructor(private prisma: PrismaService, private minio: MinioService, private config: ConfigService) {}

  private async lockAttempt(tx: Prisma.TransactionClient, attemptId: string) {
    await tx.$queryRaw`SELECT "id" FROM "attempts" WHERE "id" = ${attemptId} FOR UPDATE`;
  }

  private async maintenanceLock(tx: Prisma.TransactionClient) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${EVIDENCE_MAINTENANCE_LOCK}::bigint)`;
  }

  async setHold(attemptId: string, actor: Actor, onHold: boolean, value: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Тек әкімші сақтау тыйымын өзгерте алады');
    const reason = typeof value === 'string' ? value.trim() : '';
    if (typeof onHold !== 'boolean' || reason.length < 3 || reason.length > 2000) throw new BadRequestException('Себеп 3–2000 таңба болуы керек');
    return serializable(this.prisma, async (tx) => {
      await this.lockAttempt(tx, attemptId);
      const attempt = await tx.attempt.findUnique({ where: { id: attemptId } });
      if (!attempt) throw new NotFoundException('Талпыныс табылмады');
      if (onHold && await tx.evidenceDeletionJob.count({ where: { evidence: { attemptId }, attempts: { gt: 0 } } })) {
        throw new ConflictException({ code: 'RETENTION_ALREADY_STARTED', message: 'Жою басталған. Жазбалардың сақталуына кепілдік беру мүмкін емес' });
      }
      if (onHold) {
        await tx.evidenceDeletionJob.deleteMany({ where: { evidence: { attemptId }, attempts: 0 } });
        await tx.evidenceFile.updateMany({ where: { attemptId, deletedAt: null }, data: { deletionRequestedAt: null } });
      }
      const updated = await tx.attempt.update({ where: { id: attemptId }, data: {
        evidenceLegalHold: onHold, evidenceHoldReason: reason, evidenceHoldAt: new Date(), evidenceHoldBy: actor.id,
      } });
      await recordAudit(tx, { actorId: actor.id, action: 'EVIDENCE_HOLD_CHANGED', targetType: 'Attempt', targetId: attemptId, metadata: { attemptId, onHold } });
      return { attemptId, onHold: updated.evidenceLegalHold, reason: updated.evidenceHoldReason, changedAt: updated.evidenceHoldAt };
    });
  }

  /** Bounded, paginated operator pass. Merely constructing the service never deletes anything. */
  async run(options: { apply?: boolean; limit?: number; cursor?: string; attemptId?: string } = {}) {
    const days = retentionDays(this.config.get('EVIDENCE_RETENTION_DAYS'));
    const apply = options.apply === true;
    const limit = options.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new BadRequestException('Batch limit must be 1–1000');
    if (days === null) return { enabled: false, apply, scanned: 0, results: [], nextCursor: null };
    const files = await this.prisma.evidenceFile.findMany({
      where: { deletedAt: null, ...(options.cursor ? { id: { gt: options.cursor } } : {}), ...(options.attemptId ? { attemptId: options.attemptId } : {}) },
      include: includeEvidence, orderBy: { id: 'asc' }, take: limit,
    });
    const results: { id: string; state: string }[] = [];
    for (const file of files) {
      const reason = retentionEligibility(file, days);
      if (reason) { results.push({ id: file.id, state: reason }); continue; }
      if (!apply) { results.push({ id: file.id, state: file.deletionJob ? 'WOULD_RETRY' : 'WOULD_DELETE' }); continue; }
      await this.request(file.id, days);
      results.push({ id: file.id, state: await this.process(file.id, days) });
    }
    return { enabled: true, retentionDays: days, apply, scanned: files.length, results, nextCursor: files.length === limit ? files[files.length - 1].id : null };
  }

  private async request(evidenceId: string, days: number) {
    return serializable(this.prisma, async (tx) => {
      await this.maintenanceLock(tx);
      const initial = await tx.evidenceFile.findUnique({ where: { id: evidenceId }, select: { attemptId: true } });
      if (!initial) return;
      await this.lockAttempt(tx, initial.attemptId);
      const file = await tx.evidenceFile.findUnique({ where: { id: evidenceId }, include: includeEvidence });
      if (!file || retentionEligibility(file, days) || file.deletionJob) return;
      await tx.evidenceFile.update({ where: { id: evidenceId }, data: { deletionRequestedAt: new Date() } });
      await tx.evidenceDeletionJob.create({ data: { evidenceId, retentionDays: days } });
      await recordAudit(tx, { actorId: null, action: 'EVIDENCE_RETENTION_REQUESTED', targetType: 'EvidenceFile', targetId: evidenceId, metadata: { attemptId: file.attemptId, retentionDays: days } });
    });
  }

  private async process(evidenceId: string, days: number): Promise<string> {
    const token = randomUUID();
    const claimed = await serializable(this.prisma, async (tx) => {
      await this.maintenanceLock(tx);
      const initial = await tx.evidenceFile.findUnique({ where: { id: evidenceId }, select: { attemptId: true } });
      if (!initial) return false;
      await this.lockAttempt(tx, initial.attemptId);
      const file = await tx.evidenceFile.findUnique({ where: { id: evidenceId }, include: includeEvidence });
      if (!file?.deletionRequestedAt || !file.deletionJob || retentionEligibility(file, days)) return false;
      const claimed = await tx.evidenceDeletionJob.updateMany({
        where: { id: file.deletionJob.id, state: { not: 'DONE' }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
        data: { state: 'RUNNING', leaseToken: token, leaseUntil: new Date(Date.now() + LEASE_MS), attempts: { increment: 1 }, lastError: null },
      });
      return claimed.count === 1;
    });
    if (!claimed) return 'PROTECTED_OR_BUSY';
    try {
      // Do not use the automatic serializable retry wrapper around an external side effect.
      return await this.prisma.$transaction(async (tx) => {
        await this.maintenanceLock(tx);
        const file = await tx.evidenceFile.findUnique({ where: { id: evidenceId }, include: includeEvidence });
        if (!file?.deletionJob || file.deletionJob.leaseToken !== token || retentionEligibility(file, days)) return 'PROTECTED_OR_BUSY';
        // Once attempts>0 is committed, a hold can no longer promise preservation. An
        // uncertain remote delete is retried; the durable tombstone is never removed.
        await this.minio.removeObject(file.url);
        const deletedAt = new Date();
        const completed = await tx.evidenceDeletionJob.updateMany({ where: { evidenceId, leaseToken: token, state: { in: ['RUNNING', 'RETRY'] } }, data: { state: 'DONE', completedAt: deletedAt, leaseToken: null, leaseUntil: null, lastError: null } });
        if (completed.count !== 1) throw new ConflictException('Retention lease was replaced');
        await tx.evidenceFile.update({ where: { id: evidenceId }, data: { deletedAt } });
        await recordAudit(tx, { actorId: null, action: 'EVIDENCE_RETENTION_DELETED', targetType: 'EvidenceFile', targetId: evidenceId, metadata: { attemptId: file.attemptId, retentionDays: days } });
        return 'DELETED';
      }, { timeout: 45_000, maxWait: 5000 });
    } catch {
      // No raw S3/DB message, credentials or object path in API/audit output.
      await this.prisma.evidenceDeletionJob.updateMany({ where: { evidenceId, leaseToken: token, state: 'RUNNING' }, data: {
        // Keep the lease: a database transport failure can be observed before
        // the transaction's final commit. Immediate reassignment would race it.
        state: 'RETRY', lastError: 'STORAGE_OR_DATABASE_FAILURE',
      } }).catch(() => undefined);
      return 'RETRY';
    }
  }
}
