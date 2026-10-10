import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { CourseLevel } from '@prisma/client';
import { canManageCourse, lessonSummary, LessonViewer, sanitizeLesson } from '../lessons/lesson-access';
import { serializable } from '../prisma/serializable';

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCourseDto, teacherId: string) {
    return this.prisma.course.create({
      data: { ...dto, teacherId, status: 'DRAFT' },
      include: { teacher: { select: { id: true, name: true } } },
    });
  }

  async findAll(page = 1, limit = 20, level?: CourseLevel, teacherId?: string, manager?: LessonViewer) {
    const skip = (page - 1) * limit;
    const where: Record<string, any> = { status: 'PUBLISHED' };
    if (manager) {
      if (!['ADMIN', 'TEACHER'].includes(manager.role)) throw new ForbiddenException('Рұқсат жоқ');
      delete where.status;
    }
    if (level) where.level = level;
    if (teacherId) where.teacherId = teacherId;
    if (manager?.role === 'TEACHER') where.teacherId = manager.id;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        skip,
        take: limit,
        where,
        include: {
          teacher: { select: { id: true, name: true } },
          _count: { select: { lessons: true, exams: true } },
          lessons: { select: { id: true } },
          modules: { select: { id: true, lessons: { select: { id: true, steps: { select: { id: true } } } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.course.count({ where }),
    ]);
    const catalog = data.map((course) => ({
      ...course,
      _count: { ...course._count, lessons: new Set([
        ...course.lessons.map((lesson) => lesson.id),
        ...course.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id)),
      ]).size },
    }));
    return { data: catalog, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string, viewer?: LessonViewer) {
    const access = await this.prisma.course.findUnique({ where: { id } });
    if (!access) throw new NotFoundException('Курс табылмады');
    if (access.status !== 'PUBLISHED' && !canManageCourse(access, viewer)) {
      const enrolled = viewer && await this.prisma.enrollment.findUnique({ where: { userId_courseId: { userId: viewer.id, courseId: id } } });
      if (!enrolled) throw new NotFoundException('Курс табылмады');
    }
    const course = await this.loadCourse(id);
    return {
      ...course,
      lessons: course.lessons.map((lesson) => lessonSummary(lesson)),
      modules: course.modules.map((module) => ({
        ...module,
        lessons: module.lessons.map((lesson) => lessonSummary(lesson)),
      })),
    };
  }

  async getMaterial(id: string, viewer: LessonViewer) {
    const courseAccess = await this.prisma.course.findUnique({
      where: { id }, select: { teacherId: true },
    });
    if (!courseAccess) throw new NotFoundException('Курс табылмады');
    const managesCourse = canManageCourse(courseAccess, viewer);
    if (!managesCourse) {
      const enrollment = await this.prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: viewer.id, courseId: id } },
      });
      if (!enrollment) throw new ForbiddenException('Алдымен курсқа тіркеліңіз');
    }
    const course = await this.loadCourse(id);
    return {
      ...course,
      lessons: course.lessons.map((lesson) => sanitizeLesson(lesson, managesCourse)),
      modules: course.modules.map((module) => ({
        ...module,
        lessons: module.lessons.map((lesson) => sanitizeLesson(lesson, managesCourse)),
      })),
    };
  }

  private async loadCourse(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        teacher: { select: { id: true, name: true } },
        lessons: { orderBy: { order: 'asc' } },
        modules: {
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              orderBy: { order: 'asc' },
              include: {
                steps: { orderBy: { order: 'asc' }, select: { id: true, type: true, order: true, content: true } },
              },
            },
          },
        },
        exams: { select: { id: true, title: true, duration: true, passScore: true } },
      },
    });
    if (!course) throw new NotFoundException('Курс табылмады');
    return course;
  }

  async update(id: string, dto: UpdateCourseDto, teacherId: string, role?: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Курс табылмады');
    if (role !== 'ADMIN' && course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    return this.prisma.course.update({ where: { id }, data: dto });
  }

  async publish(id: string, viewer: LessonViewer) {
    return serializable(this.prisma, async (tx) => {
      const course = await tx.course.findUnique({ where: { id } });
      if (!course) throw new NotFoundException('Курс табылмады');
      if (!canManageCourse(course, viewer)) throw new ForbiddenException('Рұқсат жоқ');
      if (course.status === 'PUBLISHED') return course;
      const lessons = await tx.lesson.count({ where: { OR: [{ courseId: id }, { module: { courseId: id } }] } });
      if (!course.title.trim() || !course.description?.trim() || !lessons) {
        throw new BadRequestException('Жариялау үшін атау, сипаттама және кемінде бір сабақ қажет');
      }
      return tx.course.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: course.publishedAt ?? new Date() } });
    });
  }

  async archive(id: string, viewer: LessonViewer) {
    return serializable(this.prisma, async (tx) => {
      const course = await tx.course.findUnique({ where: { id } });
      if (!course) throw new NotFoundException('Курс табылмады');
      if (!canManageCourse(course, viewer)) throw new ForbiddenException('Рұқсат жоқ');
      return tx.course.update({ where: { id }, data: { status: 'ARCHIVED' } });
    });
  }

  async remove(id: string, teacherId: string, role = 'TEACHER') {
    await this.archive(id, { id: teacherId, role });
    return { message: 'Курс мұрағатталды' };
  }
}
