import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExamDto, UpdateExamDto, CreateQuestionDto, UpdateQuestionDto } from './dto/exam.dto';

@Injectable()
export class ExamsService {
  constructor(private prisma: PrismaService) {}

  async create(courseId: string, dto: CreateExamDto, teacherId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Курс табылмады');
    if (course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');

    const { questions, ...examData } = dto;

    return this.prisma.exam.create({
      data: {
        ...examData,
        courseId,
        questions: {
          create: questions.map((q) => ({
            text: q.text,
            type: q.type,
            options: q.options ? q.options : undefined,
            answer: q.answer,
          })),
        },
      },
      include: { questions: true },
    });
  }

  async findByCourse(courseId: string) {
    return this.prisma.exam.findMany({
      where: { courseId },
      include: { _count: { select: { questions: true, attempts: true } } },
    });
  }

  async findById(id: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        questions: {
          select: {
            id: true,
            text: true,
            type: true,
            options: true,
            // answer is omitted intentionally for students
          },
        },
      },
    });
    if (!exam) throw new NotFoundException('Емтихан табылмады');
    return exam;
  }

  async findByIdWithAnswers(id: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: { questions: true },
    });
    if (!exam) throw new NotFoundException('Емтихан табылмады');
    return exam;
  }

  async remove(id: string, teacherId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!exam) throw new NotFoundException('Емтихан табылмады');
    if (exam.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    await this.prisma.exam.delete({ where: { id } });
    return { message: 'Емтихан жойылды' };
  }

  async update(id: string, dto: UpdateExamDto, teacherId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!exam) throw new NotFoundException('Емтихан табылмады');
    if (exam.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    return this.prisma.exam.update({ where: { id }, data: dto });
  }

  async addQuestion(examId: string, dto: CreateQuestionDto, teacherId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { course: true },
    });
    if (!exam) throw new NotFoundException('Емтихан табылмады');
    if (exam.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    return this.prisma.question.create({
      data: {
        examId,
        text: dto.text,
        type: dto.type,
        options: dto.options ?? undefined,
        answer: dto.answer,
      },
    });
  }

  async updateQuestion(questionId: string, dto: UpdateQuestionDto, teacherId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { exam: { include: { course: true } } },
    });
    if (!question) throw new NotFoundException('Сұрақ табылмады');
    if (question.exam.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    return this.prisma.question.update({
      where: { id: questionId },
      data: {
        ...(dto.text !== undefined && { text: dto.text }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.options !== undefined && { options: dto.options }),
        ...(dto.answer !== undefined && { answer: dto.answer }),
      },
    });
  }

  async removeQuestion(questionId: string, teacherId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { exam: { include: { course: true } } },
    });
    if (!question) throw new NotFoundException('Сұрақ табылмады');
    if (question.exam.course.teacherId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');
    await this.prisma.question.delete({ where: { id: questionId } });
    return { message: 'Сұрақ жойылды' };
  }
}
