import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';

@Injectable()
export class ProctorService {
  constructor(
    private prisma: PrismaService,
    private evidenceService: EvidenceService,
  ) {}

  async recordEvent(
    attemptId: string,
    type: string,
    deduction: number,
    metadata?: Record<string, any>,
  ) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');

    const event = await this.prisma.proctorEvent.create({
      data: { attemptId, type, metadata },
    });

    const newTrustScore = Math.max(0, attempt.trustScore - deduction);
    const updatedAttempt = await this.prisma.attempt.update({
      where: { id: attemptId },
      data: {
        trustScore: newTrustScore,
        status: newTrustScore === 0 ? 'FLAGGED' : attempt.status,
      },
    });

    return { event, trustScore: updatedAttempt.trustScore };
  }

  async saveScreenshot(_attemptId: string, _base64: string) {
    // Screenshots disabled — recordings are used instead
    return null;
  }

  async endSession(attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');

    return { trustScore: attempt.trustScore, status: attempt.status };
  }

  async getSessionSummary(attemptId: string) {
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
}
