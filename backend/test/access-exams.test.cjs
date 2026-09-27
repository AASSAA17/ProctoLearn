const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { BadRequestException, ForbiddenException, NotFoundException, ConflictException, ValidationPipe } = require('@nestjs/common');
const { ExamsService } = require('../src/exams/exams.service');
const { CreateExamDto, CreateQuestionDto } = require('../src/exams/dto/exam.dto');
const { ProctorService } = require('../src/proctor/proctor.service');
const { ProctorController } = require('../src/proctor/proctor.controller');
const { ROLES_KEY } = require('../src/common/decorators/roles.decorator');

const teacher = { id: 'teacher', role: 'TEACHER' };
const admin = { id: 'admin', role: 'ADMIN' };
const foreign = { id: 'foreign', role: 'TEACHER' };
const student = { id: 'student', role: 'STUDENT' };
const question = { text: 'Choose', type: 'SINGLE_CHOICE', options: ['A', 'B'], answer: 'A' };

function fixture({ enrolled = false, active = 0, history = 0, questionExam = 'exam', answers = 0 } = {}) {
  const writes = [];
  const course = { id: 'course', teacherId: 'teacher' };
  const exam = { id: 'exam', courseId: 'course', course, title: 'Exam', duration: 30 };
  const db = {
    $transaction: async (work, options) => { assert.equal(options.isolationLevel, 'Serializable'); return work(db); },
    course: { findUnique: async () => course },
    enrollment: { findUnique: async () => enrolled ? {} : null },
    exam: {
      findUnique: async () => exam,
      findMany: async () => [exam],
      create: async ({ data }) => { writes.push(['createExam', data]); return data; },
      update: async ({ data }) => { writes.push(['updateExam', data]); return data; },
      delete: async () => { writes.push(['deleteExam']); },
    },
    attempt: { count: async ({ where }) => where.status ? active : history },
    answer: { count: async () => answers },
    question: {
      findUnique: async () => ({ examId: questionExam }),
      findMany: async ({ select }) => [Object.fromEntries(Object.entries({ id: 'question', ...question }).filter(([key]) => select[key]))],
      create: async ({ data }) => { writes.push(['createQuestion', data]); return data; },
      update: async ({ data }) => { writes.push(['updateQuestion', data]); return data; },
      delete: async () => { writes.push(['deleteQuestion']); },
    },
  };
  return { service: new ExamsService(db), writes };
}

test('exam questions are available only to enrolled readers and answer keys only to owner/admin', async () => {
  for (const reader of [student, foreign, { id: 'teacher', role: 'STUDENT' }]) {
    const { service } = fixture();
    await assert.rejects(service.findById('course', 'exam', reader), ForbiddenException);
  }
  const safe = await fixture({ enrolled: true }).service.findById('course', 'exam', student);
  assert.equal(safe.questions[0].answer, undefined);
  assert.deepEqual(safe.questions[0].options, ['A', 'B']);
  for (const reader of [teacher, admin]) {
    const full = await fixture().service.findById('course', 'exam', reader);
    assert.equal(full.questions[0].answer, 'A');
  }
});

test('exam and question reads/writes cannot substitute parent IDs in nested routes', async () => {
  const { service, writes } = fixture();
  for (const work of [
    () => service.findById('foreign-course', 'exam', teacher),
    () => service.update('foreign-course', 'exam', { duration: 60 }, teacher),
    () => service.addQuestion('foreign-course', 'exam', question, teacher),
    () => service.remove('foreign-course', 'exam', teacher),
  ]) await assert.rejects(work(), NotFoundException);
  assert.deepEqual(writes, []);
  const mismatched = fixture({ questionExam: 'another-exam' });
  await assert.rejects(mismatched.service.updateQuestion('course', 'exam', 'question', { answer: 'B' }, teacher), NotFoundException);
  await assert.rejects(mismatched.service.removeQuestion('course', 'exam', 'question', teacher), NotFoundException);
  assert.deepEqual(mismatched.writes, []);
});

test('foreign teachers cannot create or modify any exam component while administrators can manage it', async () => {
  for (const reader of [foreign, admin]) {
    const { service, writes } = fixture();
    const actions = [
      () => service.create('course', { title: 'Draft', duration: 30, questions: [] }, reader),
      () => service.update('course', 'exam', { duration: 60 }, reader),
      () => service.addQuestion('course', 'exam', question, reader),
      () => service.updateQuestion('course', 'exam', 'question', { answer: 'B' }, reader),
      () => service.removeQuestion('course', 'exam', 'question', reader),
      () => service.remove('course', 'exam', reader),
    ];
    for (const work of actions) {
      if (reader === foreign) await assert.rejects(work(), ForbiddenException);
      else await work();
    }
    assert.equal(writes.length, reader === foreign ? 0 : 6);
  }
});

test('ongoing attempts lock every exam modification before any mutation', async () => {
  const { service, writes } = fixture({ active: 1 });
  for (const work of [
    () => service.update('course', 'exam', { duration: 60 }, teacher),
    () => service.addQuestion('course', 'exam', question, teacher),
    () => service.updateQuestion('course', 'exam', 'question', { answer: 'B' }, teacher),
    () => service.removeQuestion('course', 'exam', 'question', teacher),
    () => service.remove('course', 'exam', teacher),
  ]) await assert.rejects(work(), ConflictException);
  assert.deepEqual(writes, []);
});

test('historical results and saved answers prevent destructive exam and question deletion', async () => {
  const { service, writes } = fixture({ history: 1, answers: 1 });
  await assert.rejects(service.remove('course', 'exam', teacher), ConflictException);
  await assert.rejects(service.removeQuestion('course', 'exam', 'question', teacher), ConflictException);
  assert.deepEqual(writes, []);
});

test('question DTO rejects nested answer-bearing options; a draft exam may contain zero questions', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  await assert.rejects(pipe.transform({ ...question, options: [{ text: 'A', isCorrect: true }] }, { type: 'body', metatype: CreateQuestionDto }), BadRequestException);
  const draft = await pipe.transform({ title: 'Draft', duration: 30, questions: [] }, { type: 'body', metatype: CreateExamDto });
  assert.deepEqual(draft.questions, []);
});

test('proctor candidate directory is restricted to course owner/admin and returns bounded minimal profiles', async () => {
  const queries = [];
  const service = new ProctorService({
    exam: { findUnique: async () => ({ id: 'exam', course: { teacherId: 'teacher' } }) },
    user: { findMany: async (query) => { queries.push(query); return [{ id: 'proctor', name: 'Proctor' }]; } },
  });
  for (const actor of [foreign, student, { id: 'proctor', role: 'PROCTOR' }]) {
    await assert.rejects(service.listCandidates('exam', actor), ForbiddenException);
  }
  assert.equal(queries.length, 0);
  for (const actor of [teacher, admin]) {
    assert.deepEqual(await service.listCandidates('exam', actor), [{ id: 'proctor', name: 'Proctor' }]);
  }
  assert.deepEqual(queries[0].where, { role: 'PROCTOR' });
  assert.deepEqual(queries[0].select, { id: true, name: true });
  assert.equal(queries[0].take, 100);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ProctorController.prototype.listCandidates), ['TEACHER', 'ADMIN']);
});
