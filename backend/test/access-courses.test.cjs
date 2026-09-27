const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { BadRequestException, ForbiddenException, NotFoundException, ValidationPipe } = require('@nestjs/common');
const { GUARDS_METADATA } = require('@nestjs/common/constants');
const { JwtAuthGuard } = require('../src/common/guards/jwt-auth.guard');
const { CoursesService } = require('../src/courses/courses.service');
const { CoursesController } = require('../src/courses/courses.controller');
const { ModulesService } = require('../src/modules/modules.service');
const { ReorderModuleDto } = require('../src/modules/dto/module.dto');

function contentFixture() {
  const step = {
    id: 'step', type: 'TASK', order: 1,
    content: { question: 'Choose', options: ['A', 'B'], correctAnswer: 'A', explanation: 'Private solution' },
  };
  const lesson = {
    id: 'lesson', courseId: 'course', moduleId: 'module', title: 'Lesson', order: 1,
    content: 'Private lesson material', assignment: 'Exercise', assignmentAnswer: 'Private answer', steps: [step],
  };
  const module = { id: 'module', courseId: 'course', title: 'Module', order: 1, lessons: [lesson] };
  return {
    lesson, module,
    course: { id: 'course', title: 'Course', teacherId: 'teacher', lessons: [lesson], modules: [module] },
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
