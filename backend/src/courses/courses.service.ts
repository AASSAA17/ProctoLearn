import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { CourseLevel } from '@prisma/client';

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCourseDto, teacherId: string) {
    return this.prisma.course.create({
      data: { ...dto, teacherId },
      include: { teacher: { select: { id: true, name: true } } },
    });
  }

  async findAll(page = 1, limit = 20, level?: CourseLevel, teacherId?: string) {
    const skip = (page - 1) * limit;
    const where: Record<string, any> = {};
    if (level) where.level = level;
    if (teacherId) where.teacherId = teacherId;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        skip,
        take: limit,
        where,
        include: {
          teacher: { select: { id: true, name: true } },
          _count: { select: { lessons: true, exams: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.course.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
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

  async remove(id: string, teacherId: string, role?: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Курс табылмады');
    if (role !== 'ADMIN' && course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    await this.prisma.course.delete({ where: { id } });
    return { message: 'Курс жойылды' };
  }
}
