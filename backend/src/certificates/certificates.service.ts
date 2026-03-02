import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import * as QRCode from 'qrcode';

@Injectable()
export class CertificatesService {
  constructor(private prisma: PrismaService) {}

  async issue(userId: string, courseId: string) {
    const existing = await this.prisma.certificate.findFirst({
      where: { userId, courseId },
    });
    if (existing) return existing;

    const verifyCode = uuidv4();
    const verifyUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/certificates/verify/${verifyCode}`;
    const qrCode = await QRCode.toDataURL(verifyUrl);

    return this.prisma.certificate.create({
      data: { userId, courseId, qrCode: verifyCode },
    });
  }

  async findByUser(userId: string) {
    return this.prisma.certificate.findMany({
      where: { userId },
      include: {
        course: { select: { id: true, title: true } },
        user: { select: { id: true, name: true } },
      },
    });
  }

  async verify(qrCode: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { qrCode },
      include: {
        user: { select: { id: true, name: true, email: true } },
        course: { select: { id: true, title: true } },
      },
    });
    if (!cert) return { valid: false };
    return { valid: true, certificate: cert };
  }
}
