import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLessonDto } from './dto/lesson.dto';

@Injectable()
export class LessonsService {
  constructor(private prisma: PrismaService) {}

  async create(courseId: string, dto: CreateLessonDto, teacherId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Курс табылмады');
    if (course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    return this.prisma.lesson.create({ data: { ...dto, courseId } });
  }

  async findByCourse(courseId: string) {
    return this.prisma.lesson.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
    });
  }

  async findById(id: string, userId?: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Сабақ табылмады');

    // Track progress (fire-and-forget)
    if (userId) {
      this.prisma.lessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId: id } },
        update: { viewedAt: new Date() },
        create: { userId, courseId: lesson.courseId, lessonId: id },
      }).catch(() => {});
    }

    return lesson;
  }

  async update(id: string, dto: Partial<CreateLessonDto>, teacherId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!lesson) throw new NotFoundException('Сабақ табылмады');
    if (lesson.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    return this.prisma.lesson.update({ where: { id }, data: dto });
  }

  async remove(id: string, teacherId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!lesson) throw new NotFoundException('Сабақ табылмады');
    if (lesson.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    await this.prisma.lesson.delete({ where: { id } });
    return { message: 'Сабақ жойылды' };
  }
}
