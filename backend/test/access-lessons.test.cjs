const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
require('reflect-metadata');
const { ForbiddenException, NotFoundException, BadRequestException, ValidationPipe } = require('@nestjs/common');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { StepsService } = require('../src/steps/steps.service');
const { StepsController } = require('../src/steps/steps.controller');
const { LessonsService } = require('../src/lessons/lessons.service');
const { LessonsController, ModuleLessonsController, StandaloneLessonsController } = require('../src/lessons/lessons.controller');
const { JwtStrategy } = require('../src/auth/strategies/jwt.strategy');
const { PrismaService } = require('../src/prisma/prisma.service');
const { UpdateLessonDto } = require('../src/lessons/dto/lesson.dto');
const { sanitizeLesson, lessonSummary } = require('../src/lessons/lesson-access');

const student = { id: 'student', role: 'STUDENT' };
const outsider = { id: 'outsider', role: 'TEACHER' };
const owner = { id: 'owner', role: 'TEACHER' };
const admin = { id: 'admin', role: 'ADMIN' };

function fixture({ moduleLesson = false } = {}) {
  const writes = [];
  const course = { id: 'course', teacherId: 'owner' };
  const task = { id: 'step', lessonId: 'lesson', order: 1, type: 'TASK', content: {
    question: 'Which option?', taskType: 'single_choice', options: ['A', 'B'],
    correctAnswer: 'B', explanation: 'B is correct', extra: [{ answer: 'nested answer', isCorrect: true }],
  } };
  const lesson = {
    id: 'lesson', title: 'Lesson', order: 1, content: 'Protected material', videoUrl: 'https://example.invalid/private',
    assignment: 'Assignment', assignmentAnswer: 'private answer', steps: [task],
    courseId: moduleLesson ? null : 'course', moduleId: moduleLesson ? 'module' : null,
    course: moduleLesson ? null : course,
    module: moduleLesson ? { id: 'module', courseId: 'course', course } : null,
  };
  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        const actor = [student, outsider, owner, admin].find(({ id }) => id === where.id);
        return actor ? { ...actor, tokenVersion: 0 } : null;
      },
      update: async () => ({}),
    },
    course: { findUnique: async () => course },
    courseModule: { findUnique: async () => ({ id: 'module', courseId: 'course', course }) },
    enrollment: { findUnique: async ({ where }) => where.userId_courseId.userId === student.id ? { userId: student.id, courseId: course.id } : null },
    lesson: {
      findUnique: async () => structuredClone(lesson),
      findMany: async () => [structuredClone(lesson)],
      create: async ({ data }) => { writes.push(['lesson.create', data]); return data; },
      update: async ({ data }) => { writes.push(['lesson.update', data]); return data; },
      delete: async (data) => { writes.push(['lesson.delete', data]); },
    },
    step: {
      findUnique: async () => ({ ...structuredClone(task), lesson: structuredClone(lesson) }),
      findMany: async () => [structuredClone(task)],
      create: async ({ data }) => { writes.push(['step.create', data]); return data; },
      update: async ({ data }) => { writes.push(['step.update', data]); return data; },
      delete: async (data) => { writes.push(['step.delete', data]); },
    },
    lessonProgress: {
      count: async () => 0,
      findMany: async () => [],
      upsert: async ({ create }) => { writes.push(['progress', create]); return create; },
    },
    submission: {
      findFirst: async () => null,
      create: async ({ data }) => { writes.push(['submission', data]); return data; },
      groupBy: async () => [],
    },
  };
  return { prisma, lesson, task, course, writes, steps: new StepsService(prisma), lessons: new LessonsService(prisma) };
}

function assertNoAnswers(value) {
  const json = JSON.stringify(value);
  assert.equal(json.includes('private answer'), false);
  assert.equal(json.includes('nested answer'), false);
  assert.equal(json.includes('B is correct'), false);
  assert.equal(json.includes('correctAnswer'), false);
  assert.equal(json.includes('assignmentAnswer'), false);
  assert.equal(json.includes('isCorrect'), false);
}

test('all student lesson reads hide direct, nested, and explanation answer keys without mutating stored data', async () => {
  const f = fixture();
  for (const value of [
    await f.lessons.findById('lesson', student),
    await f.lessons.findByCourse('course', student),
    await f.lessons.findByModule('module', student),
    await f.lessons.getMyProgress('course', student.id),
    await f.steps.findById('step', student),
    await f.steps.findByLesson('lesson', student),
  ]) assertNoAnswers(value);
  assert.equal(f.task.content.correctAnswer, 'B');
  assert.equal(f.lesson.assignmentAnswer, 'private answer');
  assert.deepEqual(f.writes, []);
});

test('an unrelated teacher cannot read course material or write progress without enrollment', async () => {
  const f = fixture();
  const requests = [
    () => f.lessons.findById('lesson', outsider),
    () => f.lessons.findByCourse('course', outsider),
    () => f.lessons.findByModule('module', outsider),
    () => f.steps.findById('step', outsider),
    () => f.steps.findByLesson('lesson', outsider),
    () => f.steps.submitAnswer('step', outsider, { answer: { selected: 'B' } }),
    () => f.lessons.checkAssignment('lesson', outsider, 'private answer'),
    () => f.lessons.markCompleted('lesson', outsider),
  ];
  for (const request of requests) await assert.rejects(request, ForbiddenException);
  assert.deepEqual(f.writes, []);
});

test('course authors and administrators can retrieve full keys for editing', async () => {
  const f = fixture();
  for (const viewer of [owner, admin]) {
    assert.equal((await f.lessons.findById('lesson', viewer)).assignmentAnswer, 'private answer');
    assert.equal((await f.steps.findById('step', viewer)).content.correctAnswer, 'B');
    assert.equal((await f.steps.findByLesson('lesson', viewer))[0].content.correctAnswer, 'B');
  }
});

test('module lesson ownership is resolved through its parent course', async () => {
  const f = fixture({ moduleLesson: true });
  await assert.rejects(() => f.lessons.update('lesson', { title: 'new' }, outsider), ForbiddenException);
  await assert.rejects(() => f.steps.update('step', { order: 2 }, outsider), ForbiddenException);
  await f.lessons.update('lesson', { title: 'new' }, owner);
  await f.steps.update('step', { order: 2 }, admin);
  assert.equal(f.writes.length, 2);
});

test('every lesson and step mutation rejects another teacher before writing', async () => {
  const f = fixture();
  for (const request of [
    () => f.lessons.create('course', { title: 'new' }, outsider),
    () => f.lessons.createForModule('module', { title: 'new' }, outsider),
    () => f.lessons.update('lesson', { title: 'new' }, outsider),
    () => f.lessons.remove('lesson', outsider),
    () => f.steps.create('lesson', { type: 'TEXT', order: 2, content: { html: 'new' } }, outsider),
    () => f.steps.update('step', { order: 2 }, outsider),
    () => f.steps.remove('step', outsider),
  ]) await assert.rejects(request, ForbiddenException);
  assert.deepEqual(f.writes, []);
});

test('administrators can create, update and delete lessons/steps belonging to other authors', async () => {
  const f = fixture();
  await f.lessons.create('course', { title: 'new', content: 'text', order: 2 }, admin);
  await f.lessons.createForModule('module', { title: 'new', content: 'text', order: 2 }, admin);
  await f.lessons.update('lesson', { title: 'new' }, admin);
  await f.lessons.remove('lesson', admin);
  await f.steps.create('lesson', { type: 'TEXT', order: 2, content: { html: 'new' } }, admin);
  await f.steps.update('step', { order: 2 }, admin);
  await f.steps.remove('step', admin);
  assert.equal(f.writes.length, 7);
});

test('course-prefixed reads, mutations, and completion reject mismatched parent ids', async () => {
  const f = fixture();
  for (const request of [
    () => f.lessons.findById('lesson', owner, 'foreign-course'),
    () => f.lessons.update('lesson', { title: 'new' }, owner, 'foreign-course'),
    () => f.lessons.remove('lesson', owner, 'foreign-course'),
    () => f.lessons.checkAssignment('lesson', student, 'private answer', 'foreign-course'),
    () => f.lessons.markCompleted('lesson', student, 'foreign-course'),
  ]) await assert.rejects(request, NotFoundException);
  assert.deepEqual(f.writes, []);
});

test('wrong task submission returns a score but never discloses the correct answer or explanation', async () => {
  const f = fixture();
  const wrong = await f.steps.submitAnswer('step', student, { answer: { selected: 'A' } });
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.score, 0);
  assert.equal(wrong.correctAnswer, null);
  assert.equal(wrong.explanation, null);
  const correct = await f.steps.submitAnswer('step', student, { answer: { selected: 'B' } });
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.score, 100);
  assert.equal(correct.correctAnswer, null);
});

test('malformed task answers are rejected instead of crashing or accepting coercion', async () => {
  const f = fixture();
  for (const [taskType, correctAnswer, answer] of [
    ['single_choice', 'B', {}],
    ['multiple_choice', ['B'], { selected: 'B' }],
    ['multiple_choice', ['B'], { selected: ['B', 'B'] }],
    ['text_input', 'B', { text: {} }],
    ['number_input', 0, { value: '' }],
    ['number_input', 0, { value: null }],
    ['number_input', 0, { value: [] }],
  ]) {
    Object.assign(f.task.content, { taskType, correctAnswer });
    await assert.rejects(() => f.steps.submitAnswer('step', student, { answer }), BadRequestException);
  }
  assert.deepEqual(f.writes, []);
});

test('invalid task authoring fails before saving an unusable grading key', async () => {
  const f = fixture();
  for (const content of [
    { question: 'Choose', taskType: 'single_choice', options: ['A', 'B'], correctAnswer: 'C' },
    { question: 'Choose', taskType: 'multiple_choice', options: ['A', 'B'], correctAnswer: [] },
    { question: 'Write', taskType: 'text_input', correctAnswer: '' },
    { question: 'Count', taskType: 'number_input', correctAnswer: null },
  ]) await assert.rejects(() => f.steps.create('lesson', { type: 'TASK', order: 1, content }, owner), BadRequestException);
  assert.deepEqual(f.writes, []);
});

test('viewing an assignment does not complete it, and generic completion cannot bypass grading', async () => {
  const f = fixture();
  await f.lessons.findById('lesson', student);
  assert.deepEqual(f.writes, []);
  await assert.rejects(() => f.lessons.markCompleted('lesson', student), BadRequestException);
  assert.deepEqual(f.writes, []);
  await assert.rejects(() => f.lessons.checkAssignment('lesson', student, 'private answer'), BadRequestException);
  assert.deepEqual(f.writes, []);
  f.prisma.submission.groupBy = async () => [{ stepId: 'step' }];
  await f.lessons.checkAssignment('lesson', student, 'private answer');
  assert.equal(f.writes[0][0], 'progress');
});

test('module assignment completion stores the correct course relation', async () => {
  const f = fixture({ moduleLesson: true });
  f.prisma.submission.groupBy = async () => [{ stepId: 'step' }];
  await f.lessons.checkAssignment('lesson', student, 'private answer');
  assert.deepEqual(f.writes[0][1], { userId: 'student', courseId: 'course', lessonId: 'lesson' });
});

test('task lessons cannot be marked complete until all tasks have a successful submission', async () => {
  const f = fixture({ moduleLesson: true });
  f.lesson.assignmentAnswer = null;
  await assert.rejects(() => f.lessons.markCompleted('lesson', student), BadRequestException);
  assert.deepEqual(f.writes, []);
  f.prisma.submission.groupBy = async () => [{ stepId: 'step' }];
  await f.lessons.markCompleted('lesson', student);
  assert.equal(f.writes[0][0], 'progress');
});

test('reading/video completion persists once, requires enrollment, and cannot bypass task grading', async () => {
  const f = fixture();
  await assert.rejects(() => f.steps.markCompleted('step', student), BadRequestException);
  f.task.type = 'TEXT';
  await assert.rejects(() => f.steps.markCompleted('step', outsider), ForbiddenException);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(await f.steps.markCompleted('step', student), { completed: true });
  assert.deepEqual(f.writes[0][1], { stepId: 'step', userId: 'student', answer: { acknowledged: true }, isCorrect: true, score: 0 });
  f.prisma.submission.findFirst = async () => f.writes[0][1];
  await f.steps.markCompleted('step', student);
  assert.equal(f.writes.length, 1);
});

test('prerequisite checks also apply to direct completion and assignment endpoints', async () => {
  const f = fixture();
  f.lesson.order = 2;
  f.prisma.lesson.findMany = async () => [{ id: 'previous' }];
  for (const request of [
    () => f.lessons.findById('lesson', student),
    () => f.lessons.checkAssignment('lesson', student, 'private answer'),
    () => f.lessons.markCompleted('lesson', student),
  ]) await assert.rejects(request, ForbiddenException);
  assert.deepEqual(f.writes, []);
  await f.lessons.findById('lesson', owner);
});

test('public lesson summaries exclude body, video, assignment, and task content', () => {
  const f = fixture();
  const summary = lessonSummary(f.lesson);
  assert.deepEqual(summary.steps, [{ id: 'step', type: 'TASK', order: 1 }]);
  for (const key of ['content', 'videoUrl', 'assignment', 'assignmentAnswer', 'course', 'module']) assert.equal(key in summary, false);
  assertNoAnswers(summary);
});

test('lesson PATCH has a concrete whitelist and rejects ownership/relation mass assignment', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  for (const data of [{ courseId: 'foreign' }, { moduleId: 'foreign' }, { course: { connect: { id: 'foreign' } } }, { steps: { deleteMany: {} } }]) {
    await assert.rejects(() => pipe.transform(data, { type: 'body', metatype: UpdateLessonDto }), BadRequestException);
  }
  const valid = await pipe.transform({ assignmentAnswer: 'grading answer' }, { type: 'body', metatype: UpdateLessonDto });
  assert.equal(valid.assignmentAnswer, 'grading answer');
});

test('real HTTP routes enforce JWT, enrollment, roles, parent relations and PATCH DTOs', async (t) => {
  const f = fixture();
  const secret = randomBytes(48).toString('hex');
  const module = await Test.createTestingModule({
    controllers: [StepsController, LessonsController, ModuleLessonsController, StandaloneLessonsController],
    providers: [StepsService, LessonsService, JwtStrategy,
      { provide: PrismaService, useValue: f.prisma },
      { provide: ConfigService, useValue: new ConfigService({ JWT_ACCESS_SECRET: secret }) },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const base = await app.getUrl();
  const jwt = new JwtService({ secret });
  const request = (path, actor, method = 'GET', body) => fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${jwt.sign({ sub: actor.id, role: actor.role, ver: 0 })}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const path of ['/steps/step', '/lessons/lesson/steps']) {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, outsider)).status, 403);
    const response = await request(path, student);
    assert.equal(response.status, 200);
    assertNoAnswers(await response.json());
  }
  assert.equal((await request('/lessons/lesson', student, 'PATCH', { title: 'no' })).status, 403);
  assert.equal((await request('/lessons/lesson', owner, 'PATCH', { courseId: 'foreign' })).status, 400);
  assert.equal((await request('/courses/foreign/lessons/lesson', owner)).status, 404);
  assert.equal((await request('/steps/step/complete', student, 'POST')).status, 400);
  assert.equal((await request('/steps/step/complete', undefined, 'POST')).status, 401);
  assert.equal((await request('/lessons/lesson', admin, 'PATCH', { title: 'admin edit' })).status, 200);
  assert.deepEqual(f.writes.map(([kind]) => kind), ['lesson.update']);
});
