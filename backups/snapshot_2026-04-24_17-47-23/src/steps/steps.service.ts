import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStepDto, UpdateStepDto, SubmitAnswerDto } from './dto/step.dto';
import { StepType } from '@prisma/client';

@Injectable()
export class StepsService {
  constructor(private prisma: PrismaService) {}

  async create(lessonId: string, dto: CreateStepDto, teacherId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true, module: { include: { course: true } } },
    });
    if (!lesson) throw new NotFoundException('Сабақ табылмады');

    const ownerId = lesson.course?.teacherId ?? lesson.module?.course?.teacherId;
    if (ownerId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');

    return this.prisma.step.create({
      data: { ...dto, lessonId },
    });
  }

  async findById(id: string) {
    const step = await this.prisma.step.findUnique({
      where: { id },
      include: { lesson: { select: { id: true, title: true, moduleId: true, courseId: true } } },
    });
    if (!step) throw new NotFoundException('Қадам табылмады');

    // Remove correctAnswer from task steps for students (will expose in submission result)
    return this.sanitizeStep(step);
  }

  async findByLesson(lessonId: string) {
    return this.prisma.step.findMany({
      where: { lessonId },
      orderBy: { order: 'asc' },
    });
  }

  async update(id: string, dto: UpdateStepDto, teacherId: string) {
    const step = await this.prisma.step.findUnique({
      where: { id },
      include: {
        lesson: {
          include: { course: true, module: { include: { course: true } } },
        },
      },
    });
    if (!step) throw new NotFoundException('Қадам табылмады');

    const ownerId = step.lesson.course?.teacherId ?? step.lesson.module?.course?.teacherId;
    if (ownerId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');

    return this.prisma.step.update({ where: { id }, data: dto });
  }

  async remove(id: string, teacherId: string) {
    const step = await this.prisma.step.findUnique({
      where: { id },
      include: {
        lesson: { include: { course: true, module: { include: { course: true } } } },
      },
    });
    if (!step) throw new NotFoundException('Қадам табылмады');

    const ownerId = step.lesson.course?.teacherId ?? step.lesson.module?.course?.teacherId;
    if (ownerId !== teacherId) throw new ForbiddenException('Рұқсат жоқ');

    await this.prisma.step.delete({ where: { id } });
    return { message: 'Қадам жойылды' };
  }

  async submitAnswer(stepId: string, userId: string, dto: SubmitAnswerDto) {
    const step = await this.prisma.step.findUnique({ where: { id: stepId } });
    if (!step) throw new NotFoundException('Қадам табылмады');
    if (step.type !== StepType.TASK) throw new BadRequestException('Тек тапсырма қадамдары тексеріледі');

    const { isCorrect, score } = this.checkAnswer(step.content as any, dto.answer);

    const submission = await this.prisma.submission.create({
      data: {
        stepId,
        userId,
        answer: dto.answer,
        isCorrect,
        score,
      },
    });

    const content = step.content as any;
    return {
      ...submission,
      explanation: content.explanation ?? null,
      correctAnswer: isCorrect ? null : content.correctAnswer,
    };
  }

  // ─── Auto-check logic ─────────────────────────────────────────────────────
  private checkAnswer(
    content: Record<string, any>,
    studentAnswer: Record<string, any>,
  ): { isCorrect: boolean; score: number } {
    const { taskType, correctAnswer } = content;

    if (taskType === 'single_choice') {
      const correct = studentAnswer.selected === correctAnswer;
      return { isCorrect: correct, score: correct ? 100 : 0 };
    }

    if (taskType === 'multiple_choice') {
      const studentSorted: string[] = [...(studentAnswer.selected ?? [])].sort();
      const correctSorted: string[] = [...(Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer])].sort();
      const correct = JSON.stringify(studentSorted) === JSON.stringify(correctSorted);
      return { isCorrect: correct, score: correct ? 100 : 0 };
    }

    if (taskType === 'text_input') {
      const correct =
        (studentAnswer.text ?? '').trim().toLowerCase() ===
        String(correctAnswer).toLowerCase().trim();
      return { isCorrect: correct, score: correct ? 100 : 0 };
    }

    if (taskType === 'number_input') {
      const correct = Number(studentAnswer.value) === Number(correctAnswer);
      return { isCorrect: correct, score: correct ? 100 : 0 };
    }

    return { isCorrect: false, score: 0 };
  }

  private sanitizeStep(step: any) {
    if (step.type === StepType.TASK) {
      const { correctAnswer, ...safeContent } = step.content as any;
      return { ...step, content: safeContent };
    }
    return step;
  }
}
