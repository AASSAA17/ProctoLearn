import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CertificatesService } from '../certificates/certificates.service';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { serializable } from '../prisma/serializable';
import * as ExcelJS from 'exceljs';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private certificatesService: CertificatesService,
  ) {}

  // ─── Статистика ────────────────────────────────────────────────────────────

  async getDashboardStats() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const onlineThreshold = new Date(now.getTime() - 5 * 60 * 1000); // 5 минут

    const [
      totalUsers,
      newUsersThisWeek,
      usersByRole,
      totalCourses,
      totalAttempts,
      finishedAttempts,
      onlineUsers,
      totalLessons,
      certificates,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.user.groupBy({ by: ['role'], _count: true }),
      this.prisma.course.count(),
      this.prisma.attempt.count(),
      this.prisma.attempt.count({ where: { status: 'FINISHED' } }),
      this.prisma.user.count({ where: { lastSeen: { gte: onlineThreshold } } }),
      this.prisma.lesson.count(),
      this.prisma.certificate.count(),
    ]);

    const roleMap: Record<string, number> = {};
    usersByRole.forEach((r) => { roleMap[r.role] = r._count; });

    return {
      users: {
        total: totalUsers,
        newThisWeek: newUsersThisWeek,
        online: onlineUsers,
        byRole: {
          STUDENT: roleMap['STUDENT'] || 0,
          TEACHER: roleMap['TEACHER'] || 0,
          PROCTOR: roleMap['PROCTOR'] || 0,
          ADMIN: roleMap['ADMIN'] || 0,
        },
      },
      courses: {
        total: totalCourses,
        totalLessons,
      },
      attempts: {
        total: totalAttempts,
        finished: finishedAttempts,
        inProgress: totalAttempts - finishedAttempts,
      },
      certificates: {
        total: certificates,
      },
    };
  }

  async getCourseStats() {
    const courses = await this.prisma.course.findMany({
      include: {
        teacher: { select: { id: true, name: true } },
        lessons: { select: { id: true } },
        _count: { select: { certificates: true } },
        exams: {
          select: {
            _count: { select: { attempts: true } },
          },
        },
      },
    });

    return courses.map((c) => ({
      id: c.id,
      title: c.title,
      teacher: c.teacher,
      lessonsCount: c.lessons.length,
      examsCount: c.exams.length,
      attemptsCount: c.exams.reduce((sum, e) => sum + e._count.attempts, 0),
      certificatesCount: c._count.certificates,
      createdAt: c.createdAt,
    }));
  }

  // ─── Пайдаланушылар ────────────────────────────────────────────────────────

  async getUsers(search?: string, page = 1, limit = 50) {
    const onlineThreshold = new Date(Date.now() - 5 * 60 * 1000);
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
          lastSeen: true,
          isOnline: true,
          mustChangePassword: true,
          _count: { select: { attempts: true, certificates: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => ({
        ...u,
        isOnline: u.lastSeen ? u.lastSeen >= onlineThreshold : false,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getOnlineUsers() {
    const onlineThreshold = new Date(Date.now() - 5 * 60 * 1000);
    return this.prisma.user.findMany({
      where: { lastSeen: { gte: onlineThreshold } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        lastSeen: true,
      },
      orderBy: { lastSeen: 'desc' },
    });
  }

  async getUserCourseProgress(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) throw new NotFoundException('Пайдаланушы табылмады');

    const progressRecords = await this.prisma.lessonProgress.findMany({
      where: { userId },
      include: {
        course: { select: { id: true, title: true } },
        lesson: { select: { id: true, title: true, order: true } },
      },
      orderBy: { viewedAt: 'desc' },
    });

    // Group by course
    const courseMap = new Map<string, any>();
    for (const p of progressRecords) {
      if (!courseMap.has(p.courseId)) {
        const totalLessons = await this.prisma.lesson.count({ where: { courseId: p.courseId } });
        courseMap.set(p.courseId, {
          courseId: p.courseId,
          courseTitle: p.course.title,
          totalLessons,
          viewedLessons: [],
          lastActivity: p.viewedAt,
        });
      }
      const entry = courseMap.get(p.courseId);
      entry.viewedLessons.push({ id: p.lesson.id, title: p.lesson.title, order: p.lesson.order, viewedAt: p.viewedAt });
      if (p.viewedAt > entry.lastActivity) entry.lastActivity = p.viewedAt;
    }

    return {
      user,
      courses: Array.from(courseMap.values()).map((c) => ({
        ...c,
        progress: Math.round((c.viewedLessons.length / (c.totalLessons || 1)) * 100),
      })),
    };
  }

  // ─── Пароль басқару ────────────────────────────────────────────────────────

  async resetUserPassword(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пайдаланушы табылмады');

    // Use cryptographic randomness for temporary credentials.
    const specials = '!@#$%';
    const digits = '0123456789';
    const letters = 'abcdefghjkmnpqrstuvwxyz';
    const rand = (str: string) => str[randomInt(str.length)];

    const tempPassword =
      rand(specials) +
      rand(specials) +
      rand(digits) +
      rand(digits) +
      rand(letters) +
      rand(letters) +
      rand(letters) +
      Array.from({ length: 9 }, () => rand(letters)).join('');

    // Shuffle
    const characters = tempPassword.split('');
    for (let i = characters.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [characters[i], characters[j]] = [characters[j], characters[i]];
    }
    const shuffled = characters.join('');

    const hashed = await bcrypt.hash(shuffled, 12);

    await serializable(this.prisma, async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { password: hashed, mustChangePassword: true, refreshToken: null, tokenVersion: { increment: 1 } },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
    });

    // Try to send email (non-blocking)
    await this.mailService.sendTempPassword(user.email, user.name, shuffled);

    return {
      message: 'Пароль сәтті жаңартылды',
      tempPassword: shuffled,
      email: user.email,
    };
  }

  // ─── Арнайы рұқсат беру ───────────────────────────────────────────────────

  /**
   * Пайдаланушыға толық курсты өткізіп, сертификат береді.
   * Әкімші шешімін бөлек сақтайды; сабақтар мен тапсырмалардың тарихын өзгертпейді.
   */
  async grantFullCertificate(userId: string, courseId: string, adminId: string) {
    return serializable(this.prisma, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('Пайдаланушы табылмады');
      const course = await tx.course.findUnique({ where: { id: courseId } });
      if (!course) throw new NotFoundException('Курс табылмады');
      const now = new Date();
      await tx.enrollment.upsert({
        where: { userId_courseId: { userId, courseId } },
        create: { userId, courseId, completedAt: now, examAccessGrantedAt: now, examAccessGrantedBy: adminId },
        update: { completedAt: now, examAccessGrantedAt: now, examAccessGrantedBy: adminId },
      });
      const certificate = await this.certificatesService.issue(userId, courseId, tx, 'ADMIN_OVERRIDE');
      return { message: 'Сертификат әкімші шешімімен берілді', certificate };
    });
  }

  /** An explicit administrative exemption never fabricates lesson submissions. */
  async grantExamAccess(userId: string, courseId: string, adminId: string) {
    return serializable(this.prisma, async (tx) => {
      if (!await tx.user.findUnique({ where: { id: userId } })) throw new NotFoundException('Пайдаланушы табылмады');
      if (!await tx.course.findUnique({ where: { id: courseId } })) throw new NotFoundException('Курс табылмады');
      const grant = { examAccessGrantedAt: new Date(), examAccessGrantedBy: adminId };
      await tx.enrollment.upsert({
        where: { userId_courseId: { userId, courseId } },
        create: { userId, courseId, ...grant }, update: grant,
      });
      return { message: 'Экзаменге кіру рұқсаты берілді' };
    });
  }

  // ─── Excel есептері ────────────────────────────────────────────────────────

  async exportUsersExcel(): Promise<Buffer> {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        lastSeen: true,
        _count: { select: { attempts: true, certificates: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ProctoLearn';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Пайдаланушылар');

    ws.columns = [
      { header: '№', key: 'no', width: 6 },
      { header: 'Аты-жөні', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Телефон', key: 'phone', width: 18 },
      { header: 'Рөлі', key: 'role', width: 12 },
      { header: 'Талпынулар', key: 'attempts', width: 14 },
      { header: 'Сертификаттар', key: 'certs', width: 16 },
      { header: 'Соңғы белсенділік', key: 'lastSeen', width: 22 },
      { header: 'Тіркелу күні', key: 'createdAt', width: 20 },
    ];

    // Header style
    ws.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { horizontal: 'center' };
    });

    const roleLabels: Record<string, string> = {
      STUDENT: 'Студент',
      TEACHER: 'Мұғалім',
      PROCTOR: 'Проктор',
      ADMIN: 'Adminістратор',
    };

    users.forEach((u, i) => {
      ws.addRow({
        no: i + 1,
        name: u.name,
        email: u.email,
        phone: u.phone || '—',
        role: roleLabels[u.role] || u.role,
        attempts: u._count.attempts,
        certs: u._count.certificates,
        lastSeen: u.lastSeen ? u.lastSeen.toLocaleString('kk-KZ') : '—',
        createdAt: u.createdAt.toLocaleString('kk-KZ'),
      });
    });

    ws.eachRow((row, rowNum) => {
      if (rowNum > 1) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' },
            bottom: { style: 'thin' }, right: { style: 'thin' },
          };
          if (rowNum % 2 === 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
          }
        });
      }
    });

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async exportCoursesExcel(): Promise<Buffer> {
    const courses = await this.prisma.course.findMany({
      include: {
        teacher: { select: { name: true } },
        lessons: { select: { id: true } },
        _count: { select: { certificates: true } },
        exams: { select: { _count: { select: { attempts: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ProctoLearn';

    const ws = workbook.addWorksheet('Курстар');
    ws.columns = [
      { header: '№', key: 'no', width: 6 },
      { header: 'Курс атауы', key: 'title', width: 35 },
      { header: 'Мұғалім', key: 'teacher', width: 25 },
      { header: 'Сабақтар', key: 'lessons', width: 12 },
      { header: 'Емтихандар', key: 'exams', width: 14 },
      { header: 'Талпынулар', key: 'attempts', width: 14 },
      { header: 'Сертификаттар', key: 'certs', width: 16 },
      { header: 'Жасалған күні', key: 'createdAt', width: 20 },
    ];

    ws.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { horizontal: 'center' };
    });

    courses.forEach((c, i) => {
      ws.addRow({
        no: i + 1,
        title: c.title,
        teacher: c.teacher.name,
        lessons: c.lessons.length,
        exams: c.exams.length,
        attempts: c.exams.reduce((s, e) => s + e._count.attempts, 0),
        certs: c._count.certificates,
        createdAt: c.createdAt.toLocaleString('kk-KZ'),
      });
    });

    ws.eachRow((row, rowNum) => {
      if (rowNum > 1) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' },
            bottom: { style: 'thin' }, right: { style: 'thin' },
          };
          if (rowNum % 2 === 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
          }
        });
      }
    });

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }
}
