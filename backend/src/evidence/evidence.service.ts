import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EvidenceService {
  constructor(private prisma: PrismaService) {}

  async saveRecording(
    attemptId: string,
    buffer: Buffer,
    mimeType: string,
    recordingType: 'camera' | 'screen',
  ) {
    const attempt = await this.prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');

    const uploadDir = path.join(process.cwd(), 'uploads', 'recordings', attemptId);
    fs.mkdirSync(uploadDir, { recursive: true });

    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'webm';
    const filename = `${recordingType}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(uploadDir, filename), buffer);

    const url = `/uploads/recordings/${attemptId}/${filename}`;
    return this.prisma.evidenceFile.create({
      data: { attemptId, type: `recording_${recordingType}`, url },
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
