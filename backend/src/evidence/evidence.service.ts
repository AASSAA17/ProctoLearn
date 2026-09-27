import { Injectable, NotFoundException, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { randomUUID } from 'crypto';
import { recordingFormat } from './recording-format';
import { Actor, assertProctorAccess } from '../proctor/proctor-access';

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}

  async assertOwner(attemptId: string, userId: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');
    if (attempt.userId !== userId) throw new ForbiddenException('Рұқсат жоқ');
    return attempt;
  }

  async saveRecording(
    attemptId: string,
    filePath: string,
    mimeType: string,
    recordingType: 'camera' | 'screen',
    userId: string,
  ) {
    await this.assertOwner(attemptId, userId);

    const format = await recordingFormat(filePath, mimeType);
    const objectName = `recordings/${attemptId}/${recordingType}-${randomUUID()}.${format.extension}`;
    await this.minio.uploadFile(filePath, objectName, format.mime);
    try {
      return await this.prisma.evidenceFile.create({
        data: { attemptId, type: `recording_${recordingType}`, url: objectName },
      });
    } catch (error) {
      await this.minio.removeObject(objectName).catch(() => this.logger.error('Failed to remove unreferenced recording'));
      throw error;
    }
  }

  async getEvidenceByAttempt(attemptId: string, actor: Actor) {
    await assertProctorAccess(this.prisma, attemptId, actor);

    const files = await this.prisma.evidenceFile.findMany({
      where: { attemptId },
      orderBy: { createdAt: 'asc' },
    });

    // Return presigned URLs so frontend can access MinIO objects directly
    return Promise.all(
      files.map(async (f) => ({
        ...f,
        url: await this.minio.getPresignedUrl(f.url, 300),
      })),
    );
  }
}
