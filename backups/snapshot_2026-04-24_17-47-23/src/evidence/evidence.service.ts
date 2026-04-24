import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(
    private prisma: PrismaService,
    private minio: MinioService,
  ) {}

  async saveRecording(
    attemptId: string,
    buffer: Buffer,
    mimeType: string,
    recordingType: 'camera' | 'screen',
  ) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');

    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'webm';
    const objectName = `recordings/${attemptId}/${recordingType}-${Date.now()}.${ext}`;

    const url = await this.minio.uploadBuffer(buffer, objectName, mimeType);
    this.logger.log(`Жазба MinIO-ға жүктелді: ${objectName} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

    return this.prisma.evidenceFile.create({
      data: { attemptId, type: `recording_${recordingType}`, url: objectName },
    });
  }

  async getEvidenceByAttempt(attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');

    const files = await this.prisma.evidenceFile.findMany({
      where: { attemptId },
      orderBy: { createdAt: 'asc' },
    });

    // Return presigned URLs so frontend can access MinIO objects directly
    return Promise.all(
      files.map(async (f) => ({
        ...f,
        url: await this.minio.getPresignedUrl(f.url, 3600),
      })),
    );
  }
}
