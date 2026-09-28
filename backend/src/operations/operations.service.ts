import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notifications(userId: string, cursor?: string, limit = 20) {
    // A cursor is scoped to this owner too: it cannot disclose another user's item.
    if (cursor && !await this.prisma.userNotification.findFirst({ where: { id: cursor, userId }, select: { id: true } })) {
      throw new NotFoundException('Хабарлама табылмады');
    }
    const [items, unreadCount] = await Promise.all([
      this.prisma.userNotification.findMany({
        where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: limit + 1,
        select: { id: true, type: true, title: true, body: true, targetPath: true, createdAt: true, readAt: true },
      }),
      this.prisma.userNotification.count({ where: { userId, readAt: null } }),
    ]);
    return { data: items.slice(0, limit), nextCursor: items.length > limit ? items[limit - 1].id : null, unreadCount };
  }

  async markRead(id: string, userId: string) {
    const item = await this.prisma.userNotification.findFirst({ where: { id, userId }, select: { id: true } });
    if (!item) throw new NotFoundException('Хабарлама табылмады');
    await this.prisma.userNotification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async audit(cursor?: string, limit = 50) {
    if (cursor && !await this.prisma.auditEvent.findUnique({ where: { id: cursor }, select: { id: true } })) {
      throw new NotFoundException('Оқиға табылмады');
    }
    const items = await this.prisma.auditEvent.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return { data: items.slice(0, limit), nextCursor: items.length > limit ? items[limit - 1].id : null };
  }
}
