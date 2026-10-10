import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { serializable } from '../prisma/serializable';
import { tokenDigest } from '../auth/token-digest';
import { recordAudit } from '../operations/operation-events';
import { PilotPolicy } from './pilot-policy';

type InvitedRegistration = {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  password: string;
  invitationToken: string;
  refreshTokenDigest: string;
};

@Injectable()
export class PilotService {
  constructor(private prisma: PrismaService, private policy: PilotPolicy) {}

  get enabled(): boolean { return this.policy.settings.enabled; }

  async createInvitation(emailInput: string, expiresInHours: number | undefined, actorId: string) {
    const settings = this.policy.requireEnabled();
    const email = emailInput.trim().toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const digest = tokenDigest(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (expiresInHours ?? 24) * 60 * 60 * 1000);
    const invitation = await serializable(this.prisma, async tx => {
      if (await tx.user.findUnique({ where: { email }, select: { id: true } })) throw new ConflictException('Бұл email тіркелген');
      const existing = await tx.pilotInvitation.findFirst({
        where: { email, redeemedAt: null, revokedAt: null, expiresAt: { gt: now } },
        select: { id: true },
      });
      if (existing) throw new ConflictException({ code: 'PILOT_INVITATION_EXISTS', message: 'Бұл email үшін белсенді шақыру бар' });
      const [members, pending] = await Promise.all([
        tx.pilotMembership.count(),
        tx.pilotInvitation.count({ where: { redeemedAt: null, revokedAt: null, expiresAt: { gt: now } } }),
      ]);
      if (members + pending >= settings.maxParticipants) {
        throw new ConflictException({ code: 'PILOT_COHORT_FULL', message: 'Пилоттық топта бос орын жоқ' });
      }
      const created = await tx.pilotInvitation.create({
        data: { email, tokenDigest: digest, expiresAt, createdById: actorId },
        select: { id: true, email: true, createdAt: true, expiresAt: true },
      });
      await recordAudit(tx, { actorId, action: 'PILOT_INVITATION_CREATED', targetType: 'PILOT_INVITATION', targetId: created.id });
      return created;
    });
    return { ...invitation, activationToken: token };
  }

  async registerInvited(input: InvitedRegistration) {
    const settings = this.policy.requireEnabled();
    const email = input.email.trim().toLowerCase();
    const digest = tokenDigest(input.invitationToken);
    try {
      return await serializable(this.prisma, async tx => {
        const now = new Date();
        const invitation = await tx.pilotInvitation.findUnique({ where: { tokenDigest: digest } });
        if (!invitation || invitation.email !== email || invitation.revokedAt || invitation.redeemedAt || invitation.expiresAt <= now) {
          throw new ForbiddenException({ code: 'PILOT_INVITATION_INVALID', message: 'Шақыру жарамсыз немесе мерзімі өткен' });
        }
        if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
          throw new ForbiddenException({ code: 'PILOT_INVITATION_INVALID', message: 'Шақыру жарамсыз немесе қолданылған' });
        }
        const [members, pending] = await Promise.all([
          tx.pilotMembership.count(),
          tx.pilotInvitation.count({ where: { redeemedAt: null, revokedAt: null, expiresAt: { gt: now } } }),
        ]);
        if (members + pending > settings.maxParticipants) {
          throw new ConflictException({ code: 'PILOT_COHORT_FULL', message: 'Пилоттық топта бос орын жоқ' });
        }
        const user = await tx.user.create({
          data: { id: input.userId, name: input.name.trim(), email, phone: input.phone, password: input.password, role: Role.STUDENT, refreshToken: input.refreshTokenDigest },
          select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true, mustChangePassword: true, tokenVersion: true },
        });
        const redeemed = await tx.pilotInvitation.updateMany({
          where: { id: invitation.id, tokenDigest: digest, redeemedAt: null, revokedAt: null, expiresAt: { gt: now } },
          data: { redeemedAt: now, redeemedById: user.id },
        });
        if (redeemed.count !== 1) throw new ConflictException({ code: 'PILOT_INVITATION_USED', message: 'Шақыру қолданылған' });
        await tx.pilotMembership.create({ data: { userId: user.id, invitationId: invitation.id } });
        await recordAudit(tx, { actorId: user.id, action: 'PILOT_INVITATION_REDEEMED', targetType: 'PILOT_INVITATION', targetId: invitation.id });
        return user;
      });
    } catch (error) {
      // Keep pilot registration responses independent of whether an account
      // already exists. A valid-looking token must not become an email oracle.
      if ((error as { code?: string }).code === 'P2002') {
        throw new ForbiddenException({ code: 'PILOT_INVITATION_INVALID', message: 'Шақыру жарамсыз немесе қолданылған' });
      }
      throw error;
    }
  }

  async assertRegistrationInvitation(emailInput: string, invitationToken: string): Promise<void> {
    this.policy.requireEnabled();
    const email = emailInput.trim().toLowerCase();
    const invitation = await this.prisma.pilotInvitation.findUnique({
      where: { tokenDigest: tokenDigest(invitationToken) },
      select: { email: true, expiresAt: true, redeemedAt: true, revokedAt: true },
    });
    if (!invitation || invitation.email !== email || invitation.revokedAt || invitation.redeemedAt || invitation.expiresAt <= new Date()) {
      throw new ForbiddenException({ code: 'PILOT_INVITATION_INVALID', message: 'Шақыру жарамсыз немесе мерзімі өткен' });
    }
  }

  async revokeInvitation(id: string, actorId: string) {
    this.policy.requireEnabled();
    return serializable(this.prisma, async tx => {
      const invitation = await tx.pilotInvitation.findUnique({ where: { id } });
      if (!invitation) throw new NotFoundException('Шақыру табылмады');
      if (invitation.redeemedAt) throw new ConflictException('Қолданылған шақыруды қайтарып алуға болмайды');
      if (invitation.revokedAt) return { id, revokedAt: invitation.revokedAt };
      const revokedAt = new Date();
      await tx.pilotInvitation.update({ where: { id }, data: { revokedAt } });
      await recordAudit(tx, { actorId, action: 'PILOT_INVITATION_REVOKED', targetType: 'PILOT_INVITATION', targetId: id });
      return { id, revokedAt };
    });
  }

  async assertActiveStudent(userId: string, role: string): Promise<void> {
    if (!this.policy.settings.enabled || role !== Role.STUDENT) return;
    const membership = await this.prisma.pilotMembership.findUnique({ where: { userId }, select: { status: true } });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException({ code: 'PILOT_ACCESS_DENIED', message: 'Пилотқа кіруге рұқсат жоқ немесе рұқсат тоқтатылған' });
    }
  }

  async suspendMember(userId: string, reason: string, actorId: string) {
    this.policy.requireEnabled();
    return serializable(this.prisma, async tx => {
      const membership = await tx.pilotMembership.findUnique({ where: { userId } });
      if (!membership) throw new NotFoundException('Пилот қатысушысы табылмады');
      if (membership.status === 'SUSPENDED') return membership;
      const suspendedAt = new Date();
      const updated = await tx.pilotMembership.update({
        where: { userId }, data: { status: 'SUSPENDED', suspendedAt, suspendedById: actorId, suspensionReason: reason.trim() },
      });
      await tx.user.update({ where: { id: userId }, data: { refreshToken: null, tokenVersion: { increment: 1 }, isOnline: false } });
      await recordAudit(tx, { actorId, action: 'PILOT_MEMBER_SUSPENDED', targetType: 'USER', targetId: userId });
      return updated;
    });
  }

  async resumeMember(userId: string, actorId: string) {
    this.policy.requireEnabled();
    return serializable(this.prisma, async tx => {
      const membership = await tx.pilotMembership.findUnique({ where: { userId } });
      if (!membership) throw new NotFoundException('Пилот қатысушысы табылмады');
      if (membership.status === 'ACTIVE') return membership;
      const updated = await tx.pilotMembership.update({
        where: { userId }, data: { status: 'ACTIVE', suspendedAt: null, suspendedById: null, suspensionReason: null },
      });
      await recordAudit(tx, { actorId, action: 'PILOT_MEMBER_RESUMED', targetType: 'USER', targetId: userId });
      return updated;
    });
  }

  async overview() {
    const settings = this.policy.requireEnabled();
    const now = new Date();
    const [members, invitations, courses] = await Promise.all([
      this.prisma.pilotMembership.findMany({
        select: { status: true, joinedAt: true, suspendedAt: true, user: { select: { id: true, name: true, email: true, lastSeen: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.pilotInvitation.findMany({
        select: { id: true, email: true, createdAt: true, expiresAt: true, revokedAt: true, redeemedAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.course.findMany({
        where: { status: 'PUBLISHED' }, select: { id: true, title: true, _count: { select: { enrollments: { where: { accessStatus: 'ACTIVE' } } } } }, orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      limits: { participants: settings.maxParticipants, defaultCourseSeats: settings.defaultCourseSeats },
      occupancy: {
        members: members.length,
        active: members.filter(item => item.status === 'ACTIVE').length,
        pendingInvitations: invitations.filter(item => !item.redeemedAt && !item.revokedAt && item.expiresAt > now).length,
      },
      members,
      invitations,
      courses: courses.map(course => ({ id: course.id, title: course.title, occupied: course._count.enrollments, capacity: settings.defaultCourseSeats })),
    };
  }

  async memberProgress(userId: string) {
    this.policy.requireEnabled();
    const membership = await this.prisma.pilotMembership.findUnique({
      where: { userId },
      select: { status: true, joinedAt: true, user: { select: { id: true, name: true, email: true } } },
    });
    if (!membership) throw new NotFoundException('Пилот қатысушысы табылмады');
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      select: { courseId: true, enrolledAt: true, completedAt: true, accessStatus: true, course: { select: { title: true } } },
      orderBy: { enrolledAt: 'asc' },
    });
    const completedLessons = await this.prisma.lessonProgress.groupBy({ where: { userId }, by: ['courseId'], _count: true });
    const counts = new Map(completedLessons.map(item => [item.courseId, item._count]));
    return { ...membership, enrollments: enrollments.map(item => ({ ...item, completedLessons: counts.get(item.courseId) ?? 0 })) };
  }
}
