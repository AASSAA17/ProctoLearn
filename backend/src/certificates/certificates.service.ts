import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { serializable } from '../prisma/serializable';
import { renderCertificatePdf } from './certificate-pdf';
import { certificateOrigin } from '../common/config/certificate-origin';

@Injectable()
export class CertificatesService {
  constructor(private prisma: PrismaService) {}

  async issue(userId: string, courseId: string, db?: Prisma.TransactionClient, issuedVia: 'ADMIN_OVERRIDE' | 'PROCTORED_EXAM' = 'ADMIN_OVERRIDE') {
    if (!db) return serializable(this.prisma, (tx) => this.issue(userId, courseId, tx, issuedVia));
    // A revoked certificate remains revoked; automatic review retries never reissue it.
    const existing = await this.existingForCourse(db, userId, courseId);
    if (existing) return existing;
    const [user, course] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { name: true } }),
      db.course.findUnique({ where: { id: courseId }, select: { title: true } }),
    ]);
    if (!user || !course) throw new NotFoundException('Certificate recipient or course not found');
    return db.certificate.create({ data: { userId, courseId, qrCode: uuidv4(), issuedVia,
      recipientName: user.name, courseTitle: course.title, issuerName: 'ProctoLearn', snapshotStatus: 'CAPTURED' } });
  }

  /** The only exam-driven issuance path. Review and issuance share a transaction. */
  async issueForAttempt(attemptId: string, db?: Prisma.TransactionClient) {
    if (!db) return serializable(this.prisma, (tx) => this.issueForAttempt(attemptId, tx));
    const attempt = await db.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');
    const snapshot = this.certificateSnapshot(attempt.examSnapshot);
    if (attempt.status !== 'FINISHED' || !attempt.finishedAt || attempt.reviewStatus !== 'APPROVED'
      || attempt.score === null || attempt.score < snapshot.passScore) {
      throw new ConflictException('Сертификат үшін емтихан нәтижесі мен проктордың мақұлдауы қажет');
    }
    await this.assertEvidenceReady(attemptId, db);
    const certificate = await this.issue(attempt.userId, snapshot.courseId, db, 'PROCTORED_EXAM');
    await db.enrollment.updateMany({
      where: { userId: attempt.userId, courseId: snapshot.courseId, completedAt: null },
      data: { completedAt: new Date() },
    });
    return certificate;
  }

  /** Idempotent review reads do not reissue or alter an existing legacy certificate. */
  async findForAttempt(attemptId: string, db: Prisma.TransactionClient = this.prisma) {
    const attempt = await db.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');
    const snapshot = this.certificateSnapshot(attempt.examSnapshot);
    return this.existingForCourse(db, attempt.userId, snapshot.courseId);
  }

  private async existingForCourse(db: Prisma.TransactionClient, userId: string, courseId: string) {
    return await db.certificate.findFirst({ where: { userId, courseId, status: 'VALID' } })
      ?? db.certificate.findFirst({ where: { userId, courseId }, orderBy: { issuedAt: 'asc' } });
  }

  private certificateSnapshot(value: Prisma.JsonValue | null): { courseId: string; passScore: number } {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.courseId !== 'string' || !value.courseId
      || typeof value.passScore !== 'number' || !Number.isInteger(value.passScore)
      || value.passScore < 0 || value.passScore > 100) {
      throw new ConflictException('Емтиханның сақталған ережелері жоқ немесе жарамсыз');
    }
    return { courseId: value.courseId, passScore: value.passScore };
  }

  private async assertEvidenceReady(attemptId: string, db: Prisma.TransactionClient) {
    // Read manifests inside the review transaction: concurrent upload/finalize
    // changes must conflict rather than approve partially committed recordings.
    const uploads = await db.recordingUpload.findMany({
      where: { attemptId }, select: { state: true, kind: true, evidenceId: true },
    });
    if (uploads.some((upload) => !['COMPLETE', 'ABORTED'].includes(upload.state))) {
      throw new ConflictException('Жазбалардың жүктелуі әлі аяқталған жоқ');
    }
    const files = await db.evidenceFile.findMany({
      where: { attemptId, type: { in: ['recording_camera', 'recording_screen'] }, deletionRequestedAt: null, deletedAt: null },
      select: { id: true, type: true, url: true },
    });
    if (uploads.some((upload) => upload.state === 'COMPLETE' && !files.some((file) =>
      file.id === upload.evidenceId && file.type === `recording_${upload.kind}` && !!file.url))) {
      throw new ConflictException('Аяқталған жазбаның дәлелдемесі табылмады');
    }
    const types = new Set(files.filter((file) => !!file.url).map((file) => file.type));
    if (!types.has('recording_camera') || !types.has('recording_screen')) {
      throw new ConflictException('Камера мен экранның толық жазбалары қажет');
    }
  }

  async findByUser(userId: string) {
    const certificates = await this.prisma.certificate.findMany({
      where: { userId },
      select: {
        id: true, qrCode: true, issuedAt: true, issuedVia: true, status: true,
        courseId: true, recipientName: true, courseTitle: true, issuerName: true, snapshotStatus: true,
      },
    });
    return certificates.map((cert) => ({ ...cert,
      course: { id: cert.courseId, title: cert.courseTitle ?? 'Тарихи курс атауы сақталмаған' },
      user: { name: cert.recipientName ?? 'Тарихи аты-жөні сақталмаған' },
      verificationUrl: `${certificateOrigin()}/verify/${encodeURIComponent(cert.qrCode)}`,
    }));
  }

  async verify(qrCode: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { qrCode },
      select: {
        status: true,
        issuedAt: true,
        issuedVia: true,
        recipientName: true, courseTitle: true, issuerName: true, snapshotStatus: true,
      },
    });
    if (!cert) return { valid: false };
    if (cert.status !== 'VALID') return { valid: false, status: cert.status };
    return {
      valid: true,
      certificate: {
        recipientName: cert.recipientName,
        courseTitle: cert.courseTitle,
        issuerName: cert.issuerName,
        snapshotStatus: cert.snapshotStatus,
        issuedAt: cert.issuedAt,
        issuedVia: cert.issuedVia,
      },
    };
  }

  async revoke(id: string, adminId: string, reason: string, db: Prisma.TransactionClient = this.prisma) {
    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
    if (!normalizedReason || normalizedReason.length > 500) {
      throw new ConflictException('Причина отзыва обязательна и должна быть не длиннее 500 символов');
    }
    const certificate = await db.certificate.findUnique({ where: { id } });
    if (!certificate) throw new NotFoundException('Сертификат не найден');
    if (certificate.status === 'REVOKED') return certificate;
    return db.certificate.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedBy: adminId, revocationReason: normalizedReason },
    });
  }

  async generatePdf(certId: string, userId: string): Promise<Buffer> {
    const cert = await this.prisma.certificate.findFirst({
      where: { id: certId, userId },
      include: {
        course: { select: { title: true } },
        user:   { select: { name: true } },
      },
    });
    if (!cert) throw new NotFoundException('Certificate not found');

    return renderCertificatePdf(cert);
  }
}
