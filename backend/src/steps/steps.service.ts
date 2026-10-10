import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStepDto, UpdateStepDto, SubmitAnswerDto } from './dto/step.dto';
import { StepType } from '@prisma/client';
import { serializable } from '../prisma/serializable';
import {
  LessonViewer, assertCourseManager, assertCourseReader, lessonCourse,
  lessonCourseInclude, sanitizeStep,
} from '../lessons/lesson-access';

@Injectable()
export class StepsService {
  constructor(private prisma: PrismaService) {}

  async create(lessonId: string, dto: CreateStepDto, viewer: LessonViewer) {
    const lesson = await this.getLesson(lessonId);
    assertCourseManager(lessonCourse(lesson), viewer);
    this.validateTask(dto.type, dto.content);
    return this.prisma.step.create({ data: { ...dto, lessonId } });
  }

  async findById(id: string, viewer: LessonViewer) {
    const step = await this.getStep(id);
    const manager = await assertCourseReader(this.prisma, lessonCourse(step.lesson), viewer);
    return { ...sanitizeStep(step, manager), lesson: this.lessonReference(step.lesson) };
  }

  async findByLesson(lessonId: string, viewer: LessonViewer) {
    const lesson = await this.getLesson(lessonId);
    const manager = await assertCourseReader(this.prisma, lessonCourse(lesson), viewer);
    const steps = await this.prisma.step.findMany({ where: { lessonId }, orderBy: { order: 'asc' } });
    return steps.map((step) => sanitizeStep(step, manager));
  }

  async update(id: string, dto: UpdateStepDto, viewer: LessonViewer) {
    const step = await this.getStep(id);
    assertCourseManager(lessonCourse(step.lesson), viewer);
    this.validateTask(dto.type ?? step.type, dto.content ?? step.content);
    return this.prisma.step.update({ where: { id }, data: dto });
  }

  async remove(id: string, viewer: LessonViewer) {
    return serializable(this.prisma, async (tx) => {
      const step = await tx.step.findUnique({ where: { id }, include: { lesson: { include: lessonCourseInclude } } });
      if (!step) throw new NotFoundException('Қадам табылмады');
      assertCourseManager(lessonCourse(step.lesson), viewer);
      if (await tx.submission.count({ where: { stepId: id } })) throw new ConflictException('Жауаптары бар қадамды жоюға болмайды');
      await tx.step.delete({ where: { id } });
      return { message: 'Қадам жойылды' };
    });
  }

  async submitAnswer(stepId: string, viewer: LessonViewer, dto: SubmitAnswerDto) {
    const step = await this.getStep(stepId);
    await assertCourseReader(this.prisma, lessonCourse(step.lesson), viewer);
    if (step.type !== StepType.TASK) throw new BadRequestException('Тек тапсырма қадамдары тексеріледі');
    const { isCorrect, score } = this.checkAnswer(step.content as any, dto.answer);
    const submission = await this.prisma.submission.create({
      data: { stepId, userId: viewer.id, answer: dto.answer, isCorrect, score },
    });
    // A wrong submission must not turn the grading endpoint into an answer-key endpoint.
    return { ...submission, explanation: null, correctAnswer: null };
  }

  async markCompleted(stepId: string, viewer: LessonViewer) {
    const step = await this.getStep(stepId);
    await assertCourseReader(this.prisma, lessonCourse(step.lesson), viewer);
    if (step.type === StepType.TASK) throw new BadRequestException('Алдымен тапсырмаға жауап беріңіз');
    const existing = await this.prisma.submission.findFirst({ where: { stepId, userId: viewer.id, isCorrect: true } });
    if (!existing) {
      await this.prisma.submission.create({
        data: { stepId, userId: viewer.id, answer: { acknowledged: true }, isCorrect: true, score: 0 },
      });
    }
    return { completed: true };
  }

  private checkAnswer(content: Record<string, any>, answer: Record<string, any>): { isCorrect: boolean; score: number } {
    const { taskType, correctAnswer } = content;
    let isCorrect = false;
    if (taskType === 'single_choice') {
      if (typeof answer.selected !== 'string') throw new BadRequestException('Жауап форматы қате');
      isCorrect = answer.selected === correctAnswer;
    } else if (taskType === 'multiple_choice') {
      if (!Array.isArray(answer.selected) || !answer.selected.every((item) => typeof item === 'string') || new Set(answer.selected).size !== answer.selected.length) {
        throw new BadRequestException('Жауап форматы қате');
      }
      const expected = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
      isCorrect = JSON.stringify([...answer.selected].sort()) === JSON.stringify([...expected].sort());
    } else if (taskType === 'text_input') {
      if (typeof answer.text !== 'string') throw new BadRequestException('Жауап форматы қате');
      isCorrect = answer.text.trim().toLowerCase() === String(correctAnswer).trim().toLowerCase();
    } else if (taskType === 'number_input') {
      const value = answer.value;
      if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '' || !Number.isFinite(Number(value))) {
        throw new BadRequestException('Жауап форматы қате');
      }
      isCorrect = Number(value) === Number(correctAnswer);
    } else {
      throw new BadRequestException('Тапсырма түрі қолдау таппайды');
    }
    return { isCorrect, score: isCorrect ? 100 : 0 };
  }

  private validateTask(type: StepType, content: any) {
    if (type !== StepType.TASK) return;
    const { taskType, correctAnswer } = content;
    const options = content.options;
    let valid = typeof content.question === 'string' && content.question.trim().length > 0;
    if (taskType === 'single_choice' || taskType === 'multiple_choice') {
      valid = valid && Array.isArray(options) && options.length >= 2 && options.every((option) => typeof option === 'string' && option.trim().length > 0) && new Set(options).size === options.length;
      const expected = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
      valid = valid && expected.length > 0 && new Set(expected).size === expected.length && expected.every((answer) => typeof answer === 'string' && options.includes(answer));
      if (taskType === 'single_choice') valid = valid && typeof correctAnswer === 'string';
    } else if (taskType === 'text_input') {
      valid = valid && typeof correctAnswer === 'string' && correctAnswer.trim().length > 0;
    } else if (taskType === 'number_input') {
      valid = valid && (typeof correctAnswer === 'number' || typeof correctAnswer === 'string') && String(correctAnswer).trim().length > 0 && Number.isFinite(Number(correctAnswer));
    } else valid = false;
    if (!valid) throw new BadRequestException('Тапсырма немесе дұрыс жауап форматы қате');
  }

  private async getLesson(id: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id }, include: lessonCourseInclude });
    if (!lesson) throw new NotFoundException('Сабақ табылмады');
    return lesson;
  }

  private async getStep(id: string) {
    const step = await this.prisma.step.findUnique({ where: { id }, include: { lesson: { include: lessonCourseInclude } } });
    if (!step) throw new NotFoundException('Қадам табылмады');
    return step;
  }

  private lessonReference(lesson: any) {
    const { id, title, moduleId, courseId } = lesson;
    return { id, title, moduleId, courseId };
  }
}
