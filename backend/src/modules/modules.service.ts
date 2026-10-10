import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateModuleDto, UpdateModuleDto, ReorderModuleDto } from './dto/module.dto';
import { lessonSummary } from '../lessons/lesson-access';
import { serializable } from '../prisma/serializable';

@Injectable()
export class ModulesService {
  constructor(private prisma: PrismaService) {}

  async create(courseId: string, dto: CreateModuleDto, teacherId: string, role = 'TEACHER') {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Курс табылмады');
    if (role !== 'ADMIN' && course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');

    return this.prisma.courseModule.create({
      data: { title: dto.title, order: dto.order, courseId },
      include: { lessons: { orderBy: { order: 'asc' } } },
    });
  }

  async findByCourse(courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course || course.status !== 'PUBLISHED') throw new NotFoundException('Курс табылмады');
    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
      include: {
        lessons: {
          orderBy: { order: 'asc' },
          include: { steps: { orderBy: { order: 'asc' }, select: { id: true, type: true, order: true, content: true } } },
        },
      },
    });
    return modules.map((module) => ({
      ...module, lessons: module.lessons.map((lesson) => lessonSummary(lesson)),
    }));
  }

  async findById(id: string) {
    const mod = await this.prisma.courseModule.findUnique({
      where: { id },
      include: {
        course: { select: { status: true } },
        lessons: {
          orderBy: { order: 'asc' },
          include: { steps: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!mod || mod.course.status !== 'PUBLISHED') throw new NotFoundException('Бөлім табылмады');
    const { course, ...outline } = mod;
    return { ...outline, lessons: mod.lessons.map((lesson) => lessonSummary(lesson)) };
  }

  async update(id: string, dto: UpdateModuleDto, teacherId: string, role = 'TEACHER') {
    const mod = await this.prisma.courseModule.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!mod) throw new NotFoundException('Бөлім табылмады');
    if (role !== 'ADMIN' && mod.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');

    return this.prisma.courseModule.update({ where: { id }, data: dto });
  }

  async remove(id: string, teacherId: string, role = 'TEACHER') {
    return serializable(this.prisma, async (tx) => {
      const mod = await tx.courseModule.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!mod) throw new NotFoundException('Бөлім табылмады');
      if (role !== 'ADMIN' && mod.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');

      const progress = await tx.lessonProgress.count({ where: { lesson: { moduleId: id } } });
      const submissions = await tx.submission.count({ where: { step: { lesson: { moduleId: id } } } });
      if (progress || submissions) throw new ConflictException('Оқу тарихы бар бөлімді жоюға болмайды. Курсты мұрағаттаңыз');
      await tx.courseModule.delete({ where: { id } });
      return { message: 'Бөлім жойылды' };
    });
  }

  async reorder(dto: ReorderModuleDto, teacherId: string, role = 'TEACHER') {
    const ids = dto.items.map(({ id }) => id);
    if (!ids.length || ids.length > 200 || new Set(ids).size !== ids.length) {
      throw new BadRequestException('Бөлімдер тізімі жарамсыз');
    }
    await serializable(this.prisma, async (tx) => {
      const modules = await tx.courseModule.findMany({
        where: { id: { in: ids } }, include: { course: { select: { teacherId: true } } },
      });
      if (modules.length !== ids.length) throw new NotFoundException('Бөлім табылмады');
      if (role !== 'ADMIN' && modules.some((module) => module.course.teacherId !== teacherId)) {
        throw new ForbiddenException('Рұқсат жоқ');
      }
      for (const { id, order } of dto.items) {
        await tx.courseModule.update({ where: { id }, data: { order } });
      }
    });
    return { message: 'Ретті жаңартылды' };
  }
}
