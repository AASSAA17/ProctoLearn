import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class EvidenceService {
  constructor(
    private prisma: PrismaService,
    private minioService: MinioService,
  ) {}

  async saveScreenshot(attemptId: string, base64: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');

    const objectName = `screenshots/${attemptId}/${uuidv4()}.png`;
    const url = await this.minioService.uploadBase64(base64, objectName, 'image/png');

    return this.prisma.evidenceFile.create({
      data: { attemptId, type: 'screenshot', url },
    });
  }

  async getEvidenceByAttempt(attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');

    return this.prisma.evidenceFile.findMany({
      where: { attemptId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
