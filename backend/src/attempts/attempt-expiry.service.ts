import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { serializable } from '../prisma/serializable';
import { attemptExpired } from './attempt-policy';
import { finalizeExpiredAttempt, snapshotDuration } from './attempt-state';

/** Restart-safe reconciliation of persisted attempts; bounded cursor avoids long-exam starvation. */
@Injectable()
export class AttemptExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttemptExpiryService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private cursor?: string;
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() {
    void this.reconcile();
    this.timer = setInterval(() => void this.reconcile(), 15000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async reconcile() {
    if (this.running) return 0;
    this.running = true;
    let finalized = 0;
    try {
      const rows = await this.prisma.attempt.findMany({
        where: { finishedAt: null, status: { in: ['IN_PROGRESS', 'FLAGGED'] }, ...(this.cursor ? { id: { gt: this.cursor } } : {}) },
        select: { id: true }, orderBy: { id: 'asc' }, take: 100,
      });
      this.cursor = rows.length === 100 ? rows[rows.length - 1].id : undefined;
      for (const { id } of rows) {
        try {
          finalized += await serializable(this.prisma, async (tx) => {
            const attempt = await tx.attempt.findUnique({ where: { id }, include: { exam: { include: { questions: true } } } });
            if (!attempt || attempt.finishedAt || !['IN_PROGRESS', 'FLAGGED'].includes(attempt.status)
              || !attemptExpired(attempt.startedAt, snapshotDuration(attempt))) return 0;
            await finalizeExpiredAttempt(tx, attempt);
            return 1;
          });
        } catch { this.logger.warn('An expired attempt could not be reconciled; will retry on a later pass'); }
      }
    } catch { this.logger.warn('Attempt expiry reconciliation unavailable; will retry'); }
    finally { this.running = false; }
    return finalized;
  }
}
