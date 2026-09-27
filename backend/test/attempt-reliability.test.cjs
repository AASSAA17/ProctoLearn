const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { ConfigService } = require('@nestjs/config');
const { ConflictException, ForbiddenException, BadRequestException, ValidationPipe } = require('@nestjs/common');
const { AttemptsService } = require('../src/attempts/attempts.service');
const { ExamsService } = require('../src/exams/exams.service');
const { SaveDraftDto } = require('../src/attempts/dto/attempt.dto');
const { examSnapshot, normalizedAnswer, safeAttempt } = require('../src/attempts/attempt-state');

const valid = { answers: [{ questionId: 'q1', answer: 'A' }, { questionId: 'q2', answer: 'B,C' }] };
const hasCode = (code) => (error) => error.getResponse?.().code === code;

function fixture(options = {}) {
  const exam = {
    id: 'exam', courseId: 'course', title: 'Original exam', duration: 30, passScore: 60,
    course: { id: 'course', teacherId: 'teacher' },
    questions: [{ id: 'q1', text: 'Original text', type: 'SINGLE_CHOICE', options: ['A', 'B'], answer: 'A' },
      { id: 'q2', text: 'Two choices', type: 'MULTIPLE_CHOICE', options: ['B', 'C'], answer: 'B,C' }],
  };
  const writes = [];
  const answerRows = [];
  const state = { attempt: options.empty ? null : {
    id: 'attempt', userId: 'student', examId: 'exam', startedAt: new Date(), finishedAt: null,
    status: 'IN_PROGRESS', score: null, trustScore: 100, reviewStatus: 'PENDING', flaggedAt: null,
    examSnapshot: examSnapshot(exam), draftAnswers: [], draftRevision: 0, draftUpdatedAt: null, submissionDigest: null,
    ...options.attempt,
  } };
  const hydrate = () => state.attempt && { ...state.attempt, exam, answers: [...answerRows], events: [], user: { id: 'student', name: 'Student', email: 's@example.invalid' } };
  const update = (data) => {
    for (const [key, value] of Object.entries(data)) state.attempt[key] = value?.increment ? state.attempt[key] + value.increment : value;
  };
  const db = {
    $transaction: async (work, config) => { assert.equal(config.isolationLevel, 'Serializable'); return work(db); },
    exam: { findUnique: async () => exam, update: async ({ data }) => { Object.assign(exam, data); return exam; } },
    enrollment: { findUnique: async () => options.enrollment === null ? null : { userId: 'student', courseId: 'course', ...options.enrollment } },
    lesson: { findMany: async () => options.lessons ?? [] },
    lessonProgress: { findMany: async () => options.progress ?? [] },
    submission: { groupBy: async () => options.solved ?? [] },
    answer: { createMany: async ({ data }) => { writes.push('answers'); answerRows.push(...data.map((answer, i) => ({ id: `a${i}`, ...answer }))); return { count: data.length }; } },
    attempt: {
      findUnique: async ({ where }) => state.attempt?.id === where.id ? hydrate() : null,
      findFirst: async () => state.attempt?.status === 'IN_PROGRESS' ? hydrate() : null,
      findMany: async () => state.attempt ? [hydrate()] : [],
      count: async () => state.attempt ? 1 : 0,
      create: async ({ data }) => {
        state.attempt = { id: 'attempt', startedAt: new Date(), finishedAt: null, score: null, trustScore: 100, status: 'IN_PROGRESS', reviewStatus: 'PENDING', draftAnswers: [], draftRevision: 0, draftUpdatedAt: null, submissionDigest: null, ...data };
        writes.push('create'); return hydrate();
      },
      update: async ({ data }) => { writes.push('update'); update(data); return hydrate(); },
      updateMany: async ({ where, data }) => {
        if (where.draftRevision !== undefined && state.attempt.draftRevision !== where.draftRevision) return { count: 0 };
        if (where.status && !(typeof where.status === 'string' ? state.attempt.status === where.status : where.status.in.includes(state.attempt.status))) return { count: 0 };
        if (where.finishedAt === null && state.attempt.finishedAt !== null) return { count: 0 };
        writes.push('update'); update(data); return { count: 1 };
      },
    },
    examProctor: { findUnique: async () => ({ proctorId: 'proctor', examId: 'exam' }) },
  };
  const certificates = { issue: () => assert.fail('Submission must not issue a certificate') };
  return { service: new AttemptsService(db, certificates, new ConfigService({})), db, state, exam, writes, answerRows };
}

test('start snapshots the exam; resume and grading ignore subsequent edits to duration, keys and text', async () => {
  const f = fixture({ empty: true });
  const started = await f.service.startAttempt('exam', 'student');
  assert.equal(started.exam.questions[0].answer, undefined);
  assert.equal(started.examSnapshot, undefined);
  f.exam.title = 'Changed'; f.exam.duration = 1; f.exam.questions[0].answer = 'B'; f.exam.questions[0].text = 'Changed text';
  f.state.attempt.startedAt = new Date(Date.now() - 10 * 60_000);
  const resumed = await f.service.startAttempt('exam', 'student');
  assert.equal(resumed.exam.title, 'Original exam');
  assert.equal(resumed.exam.questions[0].text, 'Original text');
  assert.equal(resumed.exam.duration, 30);
  const submitted = await f.service.submitAnswers('attempt', valid, 'student');
  assert.equal(submitted.score, 100);
  assert.equal(submitted.certificatePending, true);
  assert.equal(submitted.reviewStatus, 'PENDING');
  assert.equal(f.state.attempt.status, 'FINISHED');
});

test('draft compare-and-swap persists answers across resume and prevents stale overwrite', async () => {
  const f = fixture();
  const saved = await f.service.saveDraft('attempt', { revision: 0, ...valid }, 'student');
  assert.equal(saved.revision, 1);
  await assert.rejects(f.service.saveDraft('attempt', { revision: 0, answers: [] }, 'student'), hasCode('DRAFT_CONFLICT'));
  assert.deepEqual((await f.service.getDraft('attempt', 'student')).answers, valid.answers);
  assert.deepEqual((await f.service.startAttempt('exam', 'student')).draft.answers, valid.answers);
  await assert.rejects(f.service.saveDraft('attempt', { revision: 1, answers: [{ questionId: 'foreign', answer: 'A' }] }, 'student'), BadRequestException);
  assert.equal(f.state.attempt.draftRevision, 1);
  await assert.rejects(f.service.saveDraft('attempt', { revision: 1, answers: [] }, 'intruder'), ForbiddenException);
  await assert.rejects(f.service.getDraft('attempt', 'intruder'), ForbiddenException);
});

test('same canonical submission retry returns saved result once; different answers conflict', async () => {
  const f = fixture();
  const first = await f.service.submitAnswers('attempt', valid, 'student');
  const retry = await f.service.submitAnswers('attempt', { answers: [{ questionId: 'q2', answer: '["c", "b"]' }, { questionId: 'q1', answer: ' a ' }] }, 'student');
  assert.deepEqual(retry, first);
  assert.equal(f.answerRows.length, 2);
  assert.equal(f.writes.filter((write) => write === 'answers').length, 1);
  await assert.rejects(f.service.submitAnswers('attempt', { answers: [] }, 'student'), hasCode('SUBMISSION_CONFLICT'));
  await assert.rejects(f.service.saveDraft('attempt', { revision: 1, answers: [] }, 'student'), hasCode('ATTEMPT_CLOSED'));
});

test('late payload cannot affect grading; expiry finalizes only the saved server draft', async () => {
  const f = fixture();
  await f.service.saveDraft('attempt', { revision: 0, ...valid }, 'student');
  f.state.attempt.startedAt = new Date(0);
  await assert.rejects(f.service.submitAnswers('attempt', { answers: [{ questionId: 'q1', answer: 'B' }] }, 'student'), hasCode('EXAM_EXPIRED'));
  assert.equal(f.state.attempt.score, 100);
  assert.equal(f.state.attempt.status, 'FINISHED');
  assert.equal(f.state.attempt.reviewStatus, 'PENDING');
  assert.equal(f.answerRows[0].answer, 'A');
  const empty = fixture({ attempt: { startedAt: new Date(0) } });
  await assert.rejects(empty.service.saveDraft('attempt', { revision: 0, ...valid }, 'student'), hasCode('EXAM_EXPIRED'));
  assert.equal(empty.state.attempt.score, 0);
  assert.equal(empty.state.attempt.status, 'FAILED');
});

test('course admission checks module and flat lesson progress, verified written assignments and task solutions', async () => {
  const lessons = [{ id: 'flat', assignmentAnswer: null, steps: [] }, { id: 'module', assignmentAnswer: 'yes', steps: [{ id: 'task' }] }];
  for (const extra of [
    { progress: [] },
    { progress: [{ lessonId: 'flat', completionSource: 'MATERIAL' }, { lessonId: 'module', completionSource: 'LEGACY' }], solved: [{ stepId: 'task' }] },
    { progress: [{ lessonId: 'flat', completionSource: 'MATERIAL' }, { lessonId: 'module', completionSource: 'ASSIGNMENT' }], solved: [] },
  ]) await assert.rejects(fixture({ empty: true, lessons, ...extra }).service.startAttempt('exam', 'student'), hasCode('COURSE_INCOMPLETE'));
  const complete = fixture({ empty: true, lessons, progress: [{ lessonId: 'flat', completionSource: 'MATERIAL' }, { lessonId: 'module', completionSource: 'ASSIGNMENT' }], solved: [{ stepId: 'task' }] });
  await complete.service.startAttempt('exam', 'student');
  await fixture({ empty: true, lessons, enrollment: { examAccessGrantedAt: new Date() } }).service.startAttempt('exam', 'student');
  await assert.rejects(fixture({ empty: true, lessons, enrollment: { completedAt: new Date() } }).service.startAttempt('exam', 'student'), ForbiddenException);
});

test('attempt history and staff lists exclude persisted snapshots, drafts, digests and answer keys', async () => {
  const f = fixture({ attempt: { draftAnswers: [{ questionId: 'q1', answer: 'private-draft-marker' }], submissionDigest: 'private-digest-marker' } });
  f.state.attempt.examSnapshot.questions[0].answer = 'private-key-marker';
  for (const result of [await f.service.getAttempt('attempt', 'student'), await f.service.getUserAttempts('student'), await f.service.getAllAttempts({ id: 'admin', role: 'ADMIN' }), await f.service.getAttemptsByExam('exam', 'teacher')]) {
    const json = JSON.stringify(result);
    for (const forbidden of ['examSnapshot', 'draftAnswers', 'submissionDigest', 'private-key-marker', 'private-draft-marker', 'private-digest-marker']) assert.equal(json.includes(forbidden), false, forbidden);
  }
  assert.equal(safeAttempt({ ...f.state.attempt, futurePrivateField: 'secret' }).futurePrivateField, undefined);
});

test('expired attempts are finalized from their drafts before exam editing and flags do not close an active attempt', async () => {
  const f = fixture({ attempt: { startedAt: new Date(0), draftAnswers: valid.answers } });
  const exams = new ExamsService(f.db);
  await exams.update('course', 'exam', { title: 'Updated' }, { id: 'teacher', role: 'TEACHER' });
  assert.equal(f.state.attempt.score, 100);
  assert.equal(f.state.attempt.examSnapshot.title, 'Original exam');
  const flag = fixture();
  await flag.service.flagAttempt('attempt', { id: 'proctor', role: 'PROCTOR' });
  assert.equal(flag.state.attempt.status, 'IN_PROGRESS');
  assert.ok(flag.state.attempt.flaggedAt);
  await flag.service.submitAnswers('attempt', valid, 'student');
  flag.state.attempt.reviewStatus = 'APPROVED';
  await assert.rejects(flag.service.flagAttempt('attempt', { id: 'proctor', role: 'PROCTOR' }), ConflictException);
});

test('draft DTO rejects invalid revisions and duplicate/null answer records; JSON multiple choice preserves commas', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  for (const dto of [{ revision: -1, answers: [] }, { revision: '0', answers: [] }, { revision: 0, answers: [null] }, { revision: 0, answers: [valid.answers[0], valid.answers[0]] }]) {
    await assert.rejects(pipe.transform(dto, { type: 'body', metatype: SaveDraftDto }), BadRequestException);
  }
  assert.equal(normalizedAnswer('["Option, with comma", "B"]', 'MULTIPLE_CHOICE'), '["b","option, with comma"]');
});

test('opening owned history finalizes expired drafts once, while foreign reads cannot mutate them', async () => {
  const f = fixture({ attempt: { startedAt: new Date(0), draftAnswers: valid.answers } });
  await assert.rejects(f.service.getAttempt('attempt', 'intruder'), ForbiddenException);
  assert.equal(f.state.attempt.status, 'IN_PROGRESS');
  const history = await f.service.getAttempt('attempt', 'student');
  assert.equal(history.status, 'FINISHED');
  assert.equal(history.score, 100);
  assert.equal(history.totalQuestions, 2);
  assert.equal(history.correctCount, 2);
  assert.ok(history.answers.every((answer) => answer.id));
  await f.service.getAttempt('attempt', 'student');
  assert.equal(f.answerRows.length, 2);
  const list = fixture({ attempt: { startedAt: new Date(0), draftAnswers: valid.answers } });
  const rows = await list.service.getUserAttempts('student');
  assert.equal(rows[0].status, 'FINISHED');
  assert.equal(rows[0].score, 100);
  assert.equal(rows[0].draftAnswers, undefined);
});
