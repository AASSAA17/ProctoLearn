import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCourseDto, teacherId: string) {
    return this.prisma.course.create({
      data: { ...dto, teacherId },
      include: { teacher: { select: { id: true, name: true } } },
    });
  }

  async findAll() {
    return this.prisma.course.findMany({
      include: {
        teacher: { select: { id: true, name: true } },
        _count: { select: { lessons: true, exams: true } },
      },
    });
  }

  async findById(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        teacher: { select: { id: true, name: true } },
        lessons: { orderBy: { order: 'asc' } },
        exams: { select: { id: true, title: true, duration: true, passScore: true } },
      },
    });
    if (!course) throw new NotFoundException('Курс табылмады');
    return course;
  }

  async update(id: string, dto: UpdateCourseDto, teacherId: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Курс табылмады');
    if (course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    return this.prisma.course.update({ where: { id }, data: dto });
  }

  async remove(id: string, teacherId: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Курс табылмады');
    if (course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    await this.prisma.course.delete({ where: { id } });
    return { message: 'Курс жойылды' };
  }
}
