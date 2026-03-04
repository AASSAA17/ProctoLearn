import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateModuleDto, UpdateModuleDto, ReorderModuleDto } from './dto/module.dto';

@Injectable()
export class ModulesService {
  constructor(private prisma: PrismaService) {}

  async create(courseId: string, dto: CreateModuleDto, teacherId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Курс табылмады');
    if (course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');

    return this.prisma.courseModule.create({
      data: { title: dto.title, order: dto.order, courseId },
      include: { lessons: { orderBy: { order: 'asc' } } },
    });
  }

  async findByCourse(courseId: string) {
    return this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
      include: {
        lessons: {
          orderBy: { order: 'asc' },
          include: { steps: { orderBy: { order: 'asc' }, select: { id: true, type: true, order: true, content: true } } },
        },
      },
    });
  }

  async findById(id: string) {
    const mod = await this.prisma.courseModule.findUnique({
      where: { id },
      include: {
        lessons: {
          orderBy: { order: 'asc' },
          include: { steps: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!mod) throw new NotFoundException('Бөлім табылмады');
    return mod;
  }

  async update(id: string, dto: UpdateModuleDto, teacherId: string) {
    const mod = await this.prisma.courseModule.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!mod) throw new NotFoundException('Бөлім табылмады');
    if (mod.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');

    return this.prisma.courseModule.update({ where: { id }, data: dto });
  }

  async remove(id: string, teacherId: string) {
    const mod = await this.prisma.courseModule.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!mod) throw new NotFoundException('Бөлім табылмады');
    if (mod.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');

    await this.prisma.courseModule.delete({ where: { id } });
    return { message: 'Бөлім жойылды' };
  }

  async reorder(dto: ReorderModuleDto, teacherId: string) {
    // Verify all modules belong to courses owned by this teacher
    const updates = dto.items.map(({ id, order }) =>
      this.prisma.courseModule.update({ where: { id }, data: { order } }),
    );
    await this.prisma.$transaction(updates);
    return { message: 'Ретті жаңартылды' };
  }
}
