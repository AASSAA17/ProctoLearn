import { Injectable, NotFoundException, ForbiddenException, GoneException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { Actor, assertProctorAccess } from '../proctor/proctor-access';
import { evidenceMetadata } from './evidence-retention-policy';

@Injectable()
export class EvidenceService {
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

    throw new GoneException({ code: 'CHUNK_UPLOAD_REQUIRED', message: 'Жазбаны бөліктер арқылы жүктеңіз' });
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
        ...evidenceMetadata(f),
        ...(!f.deletionRequestedAt && !f.deletedAt ? { url: await this.minio.getPresignedUrl(f.url, 300) } : {}),
      })),
    );
  }
}
