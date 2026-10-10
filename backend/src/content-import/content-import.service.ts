import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { serializable } from '../prisma/serializable';
import { validatedQuestion } from '../exams/question-policy';
import { StepsService } from '../steps/steps.service';
import { ImportDraftDto } from './content-import.dto';

export function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function revision(value: any) { return createHash('sha256').update(canonical(value)).digest('hex'); }
async function contentHash(tx: any, id: string) {
  // Include the actual editor state, including extra/deleted author items, on retries.
  const graph = await tx.course.findUnique({ where: { id }, select: {
    title: true, description: true, level: true, status: true,
    lessons: { orderBy: { id: 'asc' }, include: { steps: { orderBy: { id: 'asc' } } } },
    modules: { orderBy: { id: 'asc' }, include: { lessons: { orderBy: { id: 'asc' }, include: { steps: { orderBy: { id: 'asc' } } } } } },
    exams: { orderBy: { id: 'asc' }, include: { questions: { orderBy: { id: 'asc' } } } },
  } });
  return revision(graph);
}
function sequence(values: { order: number }[]) {
  if (values.some((value, index) => value.order !== index + 1)) throw new BadRequestException('Рет нөмірлері бірізді болуы керек');
}
@Injectable()
export class ContentImportService {
  constructor(private prisma: PrismaService, private config: ConfigService, private steps: StepsService) {}
  async importDraft(input: ImportDraftDto, viewer: { id: string; role: string }, retry = 0): Promise<any> {
    if (!['ADMIN', 'TEACHER'].includes(viewer.role)) throw new ForbiddenException('Рұқсат жоқ');
    let url: URL;
    try { url = new URL(this.config.get<string>('DATABASE_URL') || 'http://invalid'); }
    catch { throw new ForbiddenException('Импорт тек оқшауланған pilot профилінде рұқсат етіледі'); }
    if (String(this.config.get('PILOT_MODE')) !== 'true'
      || !['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.port !== '5434' || url.username !== 'proctolearn_pilot'
      || url.pathname !== '/proctolearn_pilot') throw new ForbiddenException('Импорт тек оқшауланған pilot профилінде рұқсат етіледі');
    const course = input.course;
    if (!course?.exam || revision(course) !== input.revisionHash) throw new BadRequestException('Пакет хэші сәйкес емес');
    const expectedModules = ['C01', 'C04', 'C07', 'C10', 'C13'].some(id => input.authoringKey.endsWith(`:${id}`)) ? 4 : 3;
    if (course.modules.length !== expectedModules || course.exam.questions.length !== (expectedModules === 4 ? 15 : 12)) throw new BadRequestException('Курс құрамы жоспарға сәйкес емес');
    sequence(course.modules);
    for (const module of course.modules) {
      sequence(module.lessons);
      for (const lesson of module.lessons) {
        sequence(lesson.steps);
        if (lesson.steps[0].type !== 'TEXT' || lesson.steps.slice(1).some(step => step.type !== 'TASK') || lesson.assignmentAnswer || lesson.videoUrl) throw new BadRequestException('Тек мәтін және үш анық тапсырма рұқсат етіледі');
        for (const step of lesson.steps) this.steps.validateTask(step.type, step.content);
      }
    }
    const questions = course.exam.questions.map(validatedQuestion);
    return serializable(this.prisma, async tx => {
      const receipt = await tx.contentImportReceipt.findUnique({ where: { id: input.authoringKey }, include: { course: { select: { teacherId: true, status: true } } } });
      if (receipt) {
        // Never update existing teacher material, even if a subsequent bundle differs.
        if (receipt.ownerId !== viewer.id || receipt.course.teacherId !== viewer.id || receipt.revisionHash !== input.revisionHash
          || receipt.contentHash !== await contentHash(tx, receipt.courseId)) throw new ConflictException('Импорт бұрын орындалған: мұғалім өзгерістерін үстінен жазуға болмайды');
        return { courseId: receipt.courseId, status: receipt.course.status, replay: true, revisionHash: receipt.revisionHash };
      }
      const { modules, exam, ...metadata } = course;
      const created = await tx.course.create({ data: { ...metadata, teacherId: viewer.id, status: 'DRAFT' } });
      for (const module of modules) {
        const { lessons, ...moduleData } = module;
        const storedModule = await tx.courseModule.create({ data: { ...moduleData, courseId: created.id } });
        for (const lesson of lessons) {
          const { steps, ...lessonData } = lesson;
          const storedLesson = await tx.lesson.create({ data: { ...lessonData, moduleId: storedModule.id } });
          await tx.step.createMany({ data: steps.map(step => ({ ...step, lessonId: storedLesson.id })) });
        }
      }
      const { questions: _questions, ...examData } = exam;
      await tx.exam.create({ data: { ...examData, courseId: created.id, questions: { create: questions } } });
      await tx.contentImportReceipt.create({ data: { id: input.authoringKey, ownerId: viewer.id, courseId: created.id, revisionHash: input.revisionHash, contentHash: await contentHash(tx, created.id) } });
      return { courseId: created.id, status: 'DRAFT', replay: false, revisionHash: input.revisionHash };
    }).catch(error => {
      // A concurrently committed receipt is a replay, not an extra course. All
      // writes in the losing transaction rolled back before this bounded retry.
      if (error?.code === 'P2002' && retry < 2) return this.importDraft(input, viewer, retry + 1);
      throw error;
    });
  }
}
