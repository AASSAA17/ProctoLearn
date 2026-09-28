import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { serializable } from '../prisma/serializable';
import { notifyUser, recordAudit } from '../operations/operation-events';

export class UpdateProfileDto {
  name?: string;
  phone?: string;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        skip,
        take: limit,
        select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true, lastSeen: true, isOnline: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('Пайдаланушы табылмады');
    return user;
  }

  async updateRole(id: string, role: Role, actorId: string) {
    if (!Object.values(Role).includes(role)) throw new BadRequestException('Рөл жарамсыз');
    return serializable(this.prisma, async tx => {
      const previous = await tx.user.findUnique({ where: { id }, select: { role: true, tokenVersion: true } });
      if (!previous) throw new NotFoundException('Пайдаланушы табылмады');
      const user = await tx.user.update({
        where: { id }, data: { role, ...(previous.role !== role ? { tokenVersion: { increment: 1 }, refreshToken: null } : {}) },
        select: { id: true, name: true, email: true, role: true },
      });
      if (previous.role !== role) {
        await recordAudit(tx, { actorId, action: 'USER_ROLE_CHANGED', targetType: 'USER', targetId: id, metadata: { previousRole: previous.role, role } });
        await notifyUser(tx, { userId: id, type: 'ROLE_CHANGED', title: 'Рөліңіз өзгертілді', body: 'Әкімші тіркелгі рөлін өзгертті. Қайта кіріңіз.', targetPath: '/dashboard', dedupeKey: `role:${id}:${previous.tokenVersion + 1}` });
      }
      return user;
    });
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.phone !== undefined && { phone: dto.phone?.trim() || null }),
      },
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    });
  }
}
