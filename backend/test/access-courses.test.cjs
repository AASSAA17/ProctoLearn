const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { BadRequestException, ForbiddenException, NotFoundException, ConflictException, ValidationPipe } = require('@nestjs/common');
const { GUARDS_METADATA } = require('@nestjs/common/constants');
const { JwtAuthGuard } = require('../src/common/guards/jwt-auth.guard');
const { CoursesService } = require('../src/courses/courses.service');
const { CoursesController } = require('../src/courses/courses.controller');
const { ModulesService } = require('../src/modules/modules.service');
const { ReorderModuleDto, CreateModuleDto, UpdateModuleDto } = require('../src/modules/dto/module.dto');
const { CreateCourseDto, UpdateCourseDto } = require('../src/courses/dto/course.dto');
const { EnrollmentsService } = require('../src/enrollments/enrollments.service');
const { randomBytes } = require('node:crypto');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { JwtStrategy } = require('../src/auth/strategies/jwt.strategy');
const { PrismaService } = require('../src/prisma/prisma.service');

test('enrollment progress counts unique direct and module lessons without exposing keys', async () => {
  const direct = { id: 'direct', assignmentAnswer: null, lessonProgress: [{ completionSource: 'MANUAL' }] };
  const assigned = { id: 'assigned', assignmentAnswer: 'private key', lessonProgress: [{ completionSource: 'MANUAL' }] };
  const done = { id: 'done', assignmentAnswer: 'private key', lessonProgress: [{ completionSource: 'ASSIGNMENT' }] };
  const service = new EnrollmentsService({ enrollment: { findMany: async query => {
    assert.deepEqual(query.where, { userId: 'student' });
    assert.deepEqual(query.include.course.select.lessons.select.lessonProgress.where, { userId: 'student' });
    return [{ id: 'enrolled', completedAt: null, course: {
      id: 'course', title: 'Course', _count: { lessons: 1, exams: 1 },
      lessons: [direct], modules: [{ lessons: [direct, assigned, done] }],
    } }];
  } } });
  const [result] = await service.getMyEnrollments('student');
  assert.equal(result.totalLessons, 3);
  assert.equal(result.completedLessons, 2);
  assert.equal(result.progress, 67);
  assert.deepEqual(result.course._count, { lessons: 3, exams: 1 });
  assert.equal(JSON.stringify(result).includes('private key'), false);
  assert.equal(result.course.lessons, undefined);
  assert.equal(result.course.modules, undefined);
  assert.equal((await service.getActiveEnrollment('student')).id, 'enrolled');
});

test('module titles are trimmed and cannot become blank on create or update', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  for (const metatype of [CreateModuleDto, UpdateModuleDto]) {
    for (const title of ['', '   ', '\n\t']) await assert.rejects(pipe.transform({ title, order: 1 }, { type: 'body', metatype }), BadRequestException);
    const value = await pipe.transform({ title: '  Бөлім  ', order: 2 }, { type: 'body', metatype });
    assert.equal(value.title, 'Бөлім');
    assert.equal(value.order, 2);
  }
  const partial = await pipe.transform({ order: 3 }, { type: 'body', metatype: UpdateModuleDto });
  assert.equal(partial.title, undefined);
});

test('new enrollment requires publication while existing archived enrollments remain idempotent', async () => {
  let status = 'DRAFT';
  let existing = null;
  let writes = 0;
  const db = {
    course: { findUnique: async () => ({ id: 'course', status }) },
    enrollment: {
      findUnique: async () => existing,
      upsert: async ({ create }) => { writes++; existing = create; return create; },
    },
    $transaction: async (work, options) => { assert.equal(options.isolationLevel, 'Serializable'); return work(db); },
  };
  const service = new EnrollmentsService(db);
  for (status of ['DRAFT', 'ARCHIVED']) await assert.rejects(service.enroll('student', 'course'), ForbiddenException);
  assert.equal(writes, 0);
  status = 'PUBLISHED';
  await service.enroll('student', 'course');
  status = 'ARCHIVED';
  assert.equal((await service.enroll('student', 'course')).enrollment.userId, 'student');
  assert.equal(writes, 1);
});

test('public module endpoints hide drafts and archived outlines', async () => {
  for (const status of ['DRAFT', 'ARCHIVED']) {
    const service = new ModulesService({
      course: { findUnique: async () => ({ status }) },
      courseModule: { findUnique: async () => ({ course: { status }, lessons: [] }) },
    });
    await assert.rejects(service.findByCourse('course'), NotFoundException);
    await assert.rejects(service.findById('module'), NotFoundException);
  }
});

test('module deletion preserves learner progress and submissions', async () => {
  for (const kind of ['progress', 'submissions']) {
    let deleted = false;
    const db = {
      courseModule: { findUnique: async () => ({ course: { teacherId: 'teacher' } }), delete: async () => { deleted = true; } },
      lessonProgress: { count: async () => kind === 'progress' ? 1 : 0 },
      submission: { count: async () => kind === 'submissions' ? 1 : 0 },
      $transaction: async (work) => work(db),
    };
    await assert.rejects(new ModulesService(db).remove('module', 'teacher'), ConflictException);
    assert.equal(deleted, false);
  }
});

function contentFixture() {
  const step = {
    id: 'step', type: 'TASK', order: 1,
    content: { question: 'Choose', options: ['A', 'B'], correctAnswer: 'A', explanation: 'Private solution' },
  };
  const lesson = {
    id: 'lesson', courseId: 'course', moduleId: 'module', title: 'Lesson', order: 1,
    content: 'Private lesson material', assignment: 'Exercise', assignmentAnswer: 'Private answer', steps: [step],
  };
  const module = { id: 'module', courseId: 'course', title: 'Module', course: { status: 'PUBLISHED' }, order: 1, lessons: [lesson] };
  return {
    lesson, module,
    course: { id: 'course', title: 'Course', status: 'PUBLISHED', teacherId: 'teacher', lessons: [lesson], modules: [module] },
  };
}

test('public course, module list and module detail expose outlines without private material or answer keys', async () => {
  const fixture = contentFixture();
  const prisma = {
    course: { findUnique: async () => fixture.course },
    courseModule: { findMany: async () => [fixture.module], findUnique: async () => fixture.module },
  };
  const courses = new CoursesService(prisma);
  const modules = new ModulesService(prisma);
  for (const result of [await courses.findById('course'), await modules.findByCourse('course'), await modules.findById('module')]) {
    const json = JSON.stringify(result);
    assert.match(json, /Lesson/);
    assert.match(json, /step/);
    for (const privateField of ['Private lesson material', 'Private answer', 'correctAnswer', 'Private solution', '"options"']) {
      assert.equal(json.includes(privateField), false, privateField);
    }
  }
  assert.equal(fixture.lesson.assignmentAnswer, 'Private answer', 'serialization must not mutate ORM data');
});

test('course DTO rejects blank titles, excess content and client-controlled publication', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  for (const metatype of [CreateCourseDto, UpdateCourseDto]) {
    for (const data of [{ title: '   ' }, { title: 'x'.repeat(201) }, { title: 'Course', status: 'PUBLISHED' }, { title: 'Course', description: 'x'.repeat(20001) }]) {
      await assert.rejects(pipe.transform(data, { type: 'body', metatype }), BadRequestException);
    }
    assert.equal((await pipe.transform({ title: ' Course ' }, { type: 'body', metatype })).title, 'Course');
  }
});

test('draft publication, archive and republish preserve access and deny foreign teacher mutations', async () => {
  const { course } = contentFixture();
  Object.assign(course, { status: 'DRAFT', description: 'Coherent curriculum', publishedAt: null });
  let lessonCount = 0;
  let writes = 0;
  const db = {
    course: {
      findUnique: async () => course,
      update: async ({ data }) => { writes++; Object.assign(course, data); return { ...course }; },
    },
    lesson: { count: async () => lessonCount },
    enrollment: { findUnique: async ({ where }) => where.userId_courseId.userId === 'student' ? {} : null },
    $transaction: async (work, options) => { assert.equal(options.isolationLevel, 'Serializable'); return work(db); },
  };
  const service = new CoursesService(db);
  await assert.rejects(service.findById('course'), NotFoundException);
  await assert.rejects(service.findById('course', { id: 'other', role: 'TEACHER' }), NotFoundException);
  for (const action of ['publish', 'archive']) await assert.rejects(service[action]('course', { id: 'other', role: 'TEACHER' }), ForbiddenException);
  await assert.rejects(service.publish('course', { id: 'teacher', role: 'TEACHER' }), BadRequestException);
  assert.equal(writes, 0);
  lessonCount = 1;
  await service.publish('course', { id: 'teacher', role: 'TEACHER' });
  assert.equal((await service.findById('course')).status, 'PUBLISHED');
  const publishedAt = course.publishedAt;
  await service.publish('course', { id: 'teacher', role: 'TEACHER' });
  assert.equal(writes, 1, 'retries do not rewrite publication time');
  await service.remove('course', 'teacher', 'TEACHER');
  assert.equal(course.status, 'ARCHIVED');
  await assert.rejects(service.findById('course'), NotFoundException);
  assert.equal((await service.findById('course', { id: 'student', role: 'STUDENT' })).status, 'ARCHIVED');
  const material = await service.getMaterial('course', { id: 'student', role: 'STUDENT' });
  assert.equal(material.lessons[0].assignmentAnswer, undefined);
  await service.publish('course', { id: 'admin', role: 'ADMIN' });
  assert.equal(course.publishedAt, publishedAt);
  for (const route of ['manage', 'overview', 'publish', 'archive']) {
    assert.ok(Reflect.getMetadata(GUARDS_METADATA, CoursesController.prototype[route]).includes(JwtAuthGuard));
  }
});

test('public catalog filters unpublished records; teacher manage is always restricted to authenticated owner', async () => {
  const filters = [];
  const db = {
    course: { findMany: async ({ where }) => { filters.push(where); return []; }, count: async () => 0 },
    $transaction: async (queries) => Promise.all(queries),
  };
  const service = new CoursesService(db);
  await service.findAll(1, 20, undefined, 'target');
  await service.findAll(1, 20, undefined, 'target', { id: 'self', role: 'TEACHER' });
  await service.findAll(1, 20, undefined, undefined, { id: 'admin', role: 'ADMIN' });
  assert.deepEqual(filters, [{ status: 'PUBLISHED', teacherId: 'target' }, { teacherId: 'self' }, {}]);
  await assert.rejects(service.findAll(1, 20, undefined, undefined, { id: 'self', role: 'STUDENT' }), ForbiddenException);
});

test('catalog lesson count combines direct and module lessons without counting duplicates', async () => {
  const course = { lessons: [{ id: 'direct' }, { id: 'shared' }], modules: [{ lessons: [{ id: 'shared' }, { id: 'module' }] }], _count: { lessons: 2, exams: 1 } };
  const service = new CoursesService({ course: { findMany: async () => [course], count: async () => 1 }, $transaction: queries => Promise.all(queries) });
  const result = await service.findAll();
  assert.equal(result.data[0]._count.lessons, 3);
  assert.equal(result.data[0]._count.exams, 1);
});

test('course HTTP endpoints enforce authentication, ownership and deliberate publication', async (t) => {
  const { course } = contentFixture();
  Object.assign(course, { status: 'DRAFT', description: 'Course description' });
  const actors = [{ id: 'teacher', role: 'TEACHER' }, { id: 'other', role: 'TEACHER' }, { id: 'student', role: 'STUDENT' }];
  const db = {
    user: { findUnique: async ({ where }) => { const actor = actors.find(item => item.id === where.id); return actor ? { ...actor, tokenVersion: 0 } : null; }, update: async () => ({}) },
    course: {
      findUnique: async () => course,
      update: async ({ data }) => Object.assign(course, data),
      findMany: async ({ where }) => where.teacherId && where.teacherId !== course.teacherId ? [] : [course],
      count: async () => 1,
    },
    enrollment: { findUnique: async () => null },
    lesson: { count: async () => 1 },
    $transaction: async (work) => typeof work === 'function' ? work(db) : Promise.all(work),
  };
  const secret = randomBytes(48).toString('hex');
  const module = await Test.createTestingModule({ controllers: [CoursesController], providers: [CoursesService, JwtStrategy,
    { provide: PrismaService, useValue: db }, { provide: ConfigService, useValue: new ConfigService({ JWT_ACCESS_SECRET: secret }) },
  ] }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const base = await app.getUrl();
  const jwt = new JwtService({ secret });
  const request = (path, actor, method = 'GET', body) => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(actor ? { Cookie: `pl-access=${jwt.sign({ sub: actor.id, role: actor.role, ver: 0 }, { expiresIn: '5m' })}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await request('/courses/manage')).status, 401);
  assert.equal((await request('/courses/manage', actors[2])).status, 403);
  assert.deepEqual((await (await request('/courses/manage', actors[1])).json()).data, []);
  assert.equal((await request('/courses/course')).status, 404);
  assert.equal((await request('/courses/course/publish', actors[1], 'POST')).status, 403);
  assert.equal((await request('/courses/course', actors[1], 'PATCH', { title: 'forbidden' })).status, 403);
  assert.equal((await request('/courses/course', actors[0], 'PATCH', { status: 'PUBLISHED' })).status, 400);
  assert.equal((await request('/courses/course/publish', actors[0], 'POST')).status, 201);
  assert.equal((await request('/courses/course')).status, 200);
  assert.equal((await request('/courses/course/archive', actors[0], 'POST')).status, 201);
  assert.equal((await request('/courses/course')).status, 404);
});

test('course material requires enrollment or an owning teacher/admin and returns only student-safe keys to enrolled readers', async () => {
  const { course } = contentFixture();
  let enrolled = false;
  let materialLoads = 0;
  const service = new CoursesService({
    course: { findUnique: async ({ select }) => {
      if (select) return { teacherId: 'teacher' };
      materialLoads++;
      return course;
    } },
    enrollment: { findUnique: async () => enrolled ? {} : null },
  });
  for (const viewer of [{ id: 'student', role: 'STUDENT' }, { id: 'foreign-teacher', role: 'TEACHER' }, { id: 'teacher', role: 'STUDENT' }]) {
    await assert.rejects(service.getMaterial('course', viewer), ForbiddenException);
  }
  assert.equal(materialLoads, 0, 'unauthorized readers must not load private material');
  enrolled = true;
  const safe = await service.getMaterial('course', { id: 'student', role: 'STUDENT' });
  assert.equal(safe.lessons[0].content, 'Private lesson material');
  assert.equal(safe.lessons[0].assignmentAnswer, undefined);
  assert.equal(safe.modules[0].lessons[0].steps[0].content.correctAnswer, undefined);
  assert.equal(safe.modules[0].lessons[0].steps[0].content.explanation, undefined);
  enrolled = false;
  for (const viewer of [{ id: 'teacher', role: 'TEACHER' }, { id: 'admin', role: 'ADMIN' }]) {
    const full = await service.getMaterial('course', viewer);
    assert.equal(full.lessons[0].assignmentAnswer, 'Private answer');
    assert.equal(full.modules[0].lessons[0].steps[0].content.correctAnswer, 'A');
  }
  assert.ok(Reflect.getMetadata(GUARDS_METADATA, CoursesController.prototype.getMaterial).includes(JwtAuthGuard));
});

function reorderFixture(modules) {
  const writes = [];
  const db = {
    courseModule: {
      findMany: async ({ where }) => modules.filter((module) => where.id.in.includes(module.id)),
      update: async ({ where, data }) => { writes.push({ id: where.id, order: data.order }); },
    },
    $transaction: async (work, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      return work(db);
    },
  };
  return { service: new ModulesService(db), writes };
}

test('module reorder rejects mixed ownership or missing modules before performing any write', async () => {
  const modules = [
    { id: 'own', course: { teacherId: 'teacher' } },
    { id: 'foreign', course: { teacherId: 'other' } },
  ];
  for (const [id, expected] of [['foreign', ForbiddenException], ['missing', NotFoundException]]) {
    const { service, writes } = reorderFixture(modules);
    await assert.rejects(service.reorder({ items: [{ id: 'own', order: 2 }, { id, order: 1 }] }, 'teacher', 'TEACHER'), expected);
    assert.deepEqual(writes, []);
  }
});

test('module reorder allows course owners and administrators and rejects duplicate IDs', async () => {
  const modules = [{ id: 'one', course: { teacherId: 'teacher' } }, { id: 'two', course: { teacherId: 'teacher' } }];
  const dto = { items: [{ id: 'one', order: 2 }, { id: 'two', order: 1 }] };
  for (const [id, role] of [['teacher', 'TEACHER'], ['admin', 'ADMIN']]) {
    const { service, writes } = reorderFixture(modules);
    await service.reorder(dto, id, role);
    assert.deepEqual(writes, dto.items);
  }
  const { service, writes } = reorderFixture(modules);
  await assert.rejects(service.reorder({ items: [dto.items[0], dto.items[0]] }, 'teacher'), BadRequestException);
  assert.deepEqual(writes, []);
});

test('module reorder DTO rejects malformed, unbounded, duplicate and extra data', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const validate = (data) => pipe.transform(data, { type: 'body', metatype: ReorderModuleDto });
  for (const data of [
    {}, { items: [] }, { items: [null] },
    { items: [{ id: 'one', order: 0 }] },
    { items: [{ id: 'one', order: 1, teacherId: 'attacker' }] },
    { items: [{ id: 'one', order: 1 }, { id: 'one', order: 2 }] },
    { items: Array.from({ length: 201 }, (_, n) => ({ id: String(n), order: n + 1 })) },
  ]) await assert.rejects(validate(data), BadRequestException);
  const valid = await validate({ items: [{ id: 'one', order: 1 }] });
  assert.equal(valid.items[0].id, 'one');
});
