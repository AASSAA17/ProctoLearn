const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { BadRequestException, ForbiddenException, ConflictException, ValidationPipe } = require('@nestjs/common');
const { WsException } = require('@nestjs/websockets');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { AttemptsService } = require('../src/attempts/attempts.service');
const { ProctorService } = require('../src/proctor/proctor.service');
const { ProctorGateway } = require('../src/proctor/proctor.gateway');
const { EvidenceService } = require('../src/evidence/evidence.service');
const { RecordingOwnerGuard } = require('../src/evidence/recording-owner.guard');
const { SubmitAnswersDto } = require('../src/attempts/dto/attempt.dto');
const { ProctorEventDto } = require('../src/proctor/proctor.dto');
const { attemptExpired, validateAnswerIds } = require('../src/attempts/attempt-policy');
const { serializable } = require('../src/prisma/serializable');
const { validateEnvironment } = require('../src/common/config/environment');

function fixture(overrides = {}) {
  const writes = [];
  const questions = [
    { id: 'q1', type: 'SINGLE_CHOICE', answer: 'A' },
    { id: 'q2', type: 'MULTIPLE_CHOICE', answer: 'A,B' },
  ];
  const attempt = {
    id: 'attempt', userId: 'student', status: 'IN_PROGRESS', trustScore: 100,
    startedAt: new Date(), examId: 'exam', finishedAt: null, answers: [], draftAnswers: [], draftRevision: 0, reviewStatus: 'PENDING',
    exam: { id: 'exam', duration: 30, passScore: 60, courseId: 'course', questions, _count: { questions: 2 } },
    user: { id: 'student', name: 'Test', email: 'test@example.invalid' },
    ...overrides,
  };
  attempt.examSnapshot ??= structuredClone(attempt.exam);
  const prisma = {
    $transaction: async (work, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      return work(prisma);
    },
    exam: { findUnique: async () => attempt.exam },
    enrollment: {
      findUnique: async () => ({ userId: 'student', courseId: 'course' }),
      findMany: async () => [{ courseId: 'course' }],
      updateMany: async (data) => { writes.push(['enrollment', data]); return { count: 1 }; },
    },
    course: { findMany: async () => [] },
    lesson: { findMany: async () => [] },
    lessonProgress: { findMany: async () => [] },
    examProctor: { findUnique: async ({ where }) => where.examId_proctorId.proctorId === 'proctor' ? { examId: 'exam', proctorId: 'proctor' } : null },
    attempt: {
      findUnique: async () => ({ ...attempt }),
      findFirst: async () => ({ ...attempt }),
      count: async () => 0,
      create: async () => { writes.push(['create']); return attempt; },
      update: async ({ data }) => { writes.push(['attempt', data]); Object.assign(attempt, data); return { ...attempt }; },
      updateMany: async ({ where, data }) => {
        if (typeof where.status === 'string' && attempt.status !== where.status) return { count: 0 };
        if (where.status?.in && !where.status.in.includes(attempt.status)) return { count: 0 };
        if ('finishedAt' in where && attempt.finishedAt !== where.finishedAt) return { count: 0 };
        if ('draftRevision' in where && attempt.draftRevision !== where.draftRevision) return { count: 0 };
        writes.push(['attempt', data]);
        for (const [key, value] of Object.entries(data)) attempt[key] = value?.increment ? attempt[key] + value.increment : value;
        return { count: 1 };
      },
    },
    answer: { createMany: async ({ data }) => { writes.push(['answers', data]); attempt.answers.push(...data); return { count: data.length }; } },
    proctorEvent: { count: async () => 0, create: async ({ data }) => { writes.push(['event', data]); return data; } },
  };
  const certificates = { issue: async (_u, _c, tx) => { assert.equal(tx, prisma); writes.push(['certificate']); } };
  const service = new AttemptsService(prisma, certificates, new ConfigService({}));
  return { service, prisma, attempt, writes, proctor: new ProctorService(prisma) };
}
const valid = { answers: [{ questionId: 'q1', answer: 'A' }, { questionId: 'q2', answer: 'B,A' }] };
const expired = (error) => error.getResponse?.().code === 'EXAM_EXPIRED';

test('duplicate correct answers cannot inflate the grade', async () => {
  const f = fixture();
  await assert.rejects(f.service.submitAnswers('attempt', { answers: [valid.answers[0], valid.answers[0]] }, 'student'), BadRequestException);
  assert.deepEqual(f.writes, []);
});
test('questions from another exam are rejected', async () => {
  const f = fixture();
  await assert.rejects(f.service.submitAnswers('attempt', { answers: [{ questionId: 'foreign', answer: 'A' }] }, 'student'), BadRequestException);
  assert.deepEqual(f.writes, []);
});
test('foreign attempt submission is rejected before mutation', async () => {
  const f = fixture();
  await assert.rejects(f.service.submitAnswers('attempt', valid, 'intruder'), ForbiddenException);
  assert.deepEqual(f.writes, []);
});
test('expired submissions close the attempt without issuing a certificate', async () => {
  const f = fixture({ startedAt: new Date(Date.now() - 31 * 60_000) });
  await assert.rejects(f.service.submitAnswers('attempt', valid, 'student'), expired);
  assert.equal(f.attempt.status, 'FAILED');
  assert.equal(f.attempt.score, 0);
  assert.equal(f.writes.some(([kind]) => kind === 'certificate'), false);
});
test('deadline has a fixed five-second network allowance', () => {
  const start = new Date(0);
  assert.equal(attemptExpired(start, 1, 65_000), false);
  assert.equal(attemptExpired(start, 1, 65_001), true);
});
test('successful submission saves answers and grade but waits for review before issuing a certificate', async () => {
  const f = fixture();
  const result = await f.service.submitAnswers('attempt', valid, 'student');
  assert.equal(result.score, 100);
  assert.equal(result.passed, true);
  assert.equal(result.certificatePending, true);
  assert.deepEqual(f.writes.map(([kind]) => kind), ['attempt', 'answers']);
});
test('empty submission gives zero, not a certificate', async () => {
  const f = fixture();
  const result = await f.service.submitAnswers('attempt', { answers: [] }, 'student');
  assert.equal(result.score, 0);
  assert.equal(result.passed, false);
});
test('a second submission cannot write more answers or award again', async () => {
  const f = fixture();
  await f.service.submitAnswers('attempt', valid, 'student');
  const count = f.writes.length;
  assert.equal((await f.service.submitAnswers('attempt', valid, 'student')).score, 100);
  await assert.rejects(f.service.submitAnswers('attempt', { answers: [] }, 'student'), ConflictException);
  assert.equal(f.writes.length, count);
});
test('a proctor flag does not prevent submission and still cannot issue a certificate', async () => {
  const f = fixture({ flaggedAt: new Date(), trustScore: 0 });
  const result = await f.service.submitAnswers('attempt', valid, 'student');
  assert.equal(result.passed, true);
  assert.equal(result.reviewStatus, 'PENDING');
  assert.equal(f.writes.some(([kind]) => kind === 'certificate'), false);
});
test('start requires enrollment and returns a server deadline on resume', async () => {
  const f = fixture();
  const result = await f.service.startAttempt('exam', 'student');
  assert.equal(Date.parse(result.expiresAt), f.attempt.startedAt.getTime() + 30 * 60_000);
  f.prisma.enrollment.findUnique = async () => null;
  await assert.rejects(f.service.startAttempt('exam', 'student'), ForbiddenException);
});
test('resuming an expired attempt commits expiry instead of leaving it stuck', async () => {
  const f = fixture({ startedAt: new Date(0) });
  await assert.rejects(f.service.startAttempt('exam', 'student'), expired);
  assert.equal(f.attempt.status, 'FAILED');
});
test('start still enforces maximum number of attempts', async () => {
  const f = fixture();
  f.prisma.attempt.findFirst = async () => null;
  f.prisma.attempt.count = async () => 5;
  await assert.rejects(f.service.startAttempt('exam', 'student'), BadRequestException);
  assert.deepEqual(f.writes, []);
});
test('DTO rejects duplicate answers as well as service-level validation', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  await assert.rejects(pipe.transform({ answers: [valid.answers[0], valid.answers[0]] }, { type: 'body', metatype: SubmitAnswersDto }), BadRequestException);
});
test('invalid event names, foreign fields, and malformed metadata are rejected', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  for (const data of [
    { attemptId: 'a', type: 'invented' },
    { attemptId: 'a', type: 'tab_switch', deduction: -100 },
    { attemptId: 'a', type: 'tab_switch', metadata: [] },
  ]) await assert.rejects(pipe.transform(data, { type: 'body', metatype: ProctorEventDto }), BadRequestException);
});
test('student cannot join another student room or impersonate a proctor', async () => {
  const f = fixture();
  await assert.rejects(f.proctor.assertSessionAccess('attempt', 'intruder', 'STUDENT', false), ForbiddenException);
  await assert.rejects(f.proctor.assertSessionAccess('attempt', 'student', 'STUDENT', true), ForbiddenException);
  await f.proctor.assertSessionAccess('attempt', 'proctor', 'PROCTOR', true);
});
test('foreign proctor events cannot reduce trust score', async () => {
  const f = fixture();
  await assert.rejects(f.proctor.recordEvent('attempt', 'intruder', 'tab_switch'), ForbiddenException);
  assert.deepEqual(f.writes, []);
});
test('screen sharing penalty is server-defined and score is clamped to zero', async () => {
  const f = fixture({ trustScore: 5 });
  const result = await f.proctor.recordEvent('attempt', 'student', 'screen_share_stopped');
  assert.equal(result.trustScore, 0);
  assert.equal(f.attempt.status, 'IN_PROGRESS');
  assert.ok(f.attempt.flaggedAt instanceof Date);
});
test('completed or expired attempts reject proctor event mutation', async () => {
  for (const overrides of [{ status: 'FINISHED' }, { startedAt: new Date(0) }]) {
    const f = fixture(overrides);
    await assert.rejects(f.proctor.recordEvent('attempt', 'student', 'tab_switch'), BadRequestException);
    assert.deepEqual(f.writes, []);
  }
});
test('student cannot emit exam-ended before server completion', async () => {
  const f = fixture();
  await assert.rejects(f.proctor.endSession('attempt', 'student', 'STUDENT'), BadRequestException);
});
test('foreign recordings are rejected before any MinIO upload', async () => {
  const f = fixture();
  const evidence = new EvidenceService(f.prisma, { uploadFile: () => assert.fail('must not upload') });
  await assert.rejects(evidence.saveRecording('attempt', '/unused-file', 'video/webm', 'camera', 'intruder'), ForbiddenException);
  const guard = new RecordingOwnerGuard(evidence);
  const context = { switchToHttp: () => ({ getRequest: () => ({ params: { attemptId: 'attempt' }, user: { id: 'intruder' } }) }) };
  await assert.rejects(guard.canActivate(context), ForbiddenException);
});
test('serializable conflict is retried, validation errors are not', async () => {
  let calls = 0;
  const db = { $transaction: async () => { if (++calls < 3) throw { code: 'P2034' }; return 42; } };
  assert.equal(await serializable(db, async () => 42), 42);
  assert.equal(calls, 3);
  calls = 0;
  db.$transaction = async () => { calls++; throw new BadRequestException(); };
  await assert.rejects(serializable(db, async () => 42), BadRequestException);
  assert.equal(calls, 1);
});
test('serializable conflicts have a bounded retry budget', async () => {
  let calls = 0;
  await assert.rejects(serializable({ $transaction: async () => { calls++; throw { code: 'P2034' }; } }, async () => {}), ConflictException);
  assert.equal(calls, 3);
});
test('JWT secrets must be present, strong and distinct', () => {
  assert.throws(() => validateEnvironment({}));
  assert.throws(() => validateEnvironment({ JWT_ACCESS_SECRET: 'access_secret', JWT_REFRESH_SECRET: 'refresh_secret' }));
  assert.throws(() => validateEnvironment({ JWT_ACCESS_SECRET: 'x'.repeat(64), JWT_REFRESH_SECRET: 'x'.repeat(64) }));
  assert.doesNotThrow(() => validateEnvironment({ JWT_ACCESS_SECRET: 'a'.repeat(64), JWT_REFRESH_SECRET: 'b'.repeat(64) }));
});
test('socket revalidates expired tokens and deleted users before invoking services', async () => {
  const key = 'c'.repeat(64);
  const jwt = new JwtService();
  const config = new ConfigService({ JWT_ACCESS_SECRET: key });
  const service = { recordEvent: () => assert.fail('must not process an event') };
  for (const token of [jwt.sign({ sub: 'student' }, { secret: key, expiresIn: -1 }), jwt.sign({ sub: 'deleted' }, { secret: key, expiresIn: '15m' })]) {
    let disconnected = false;
    const client = { data: {}, handshake: { headers: { origin: 'http://localhost:3000', cookie: `pl-access=${token}` } }, emit() {}, disconnect() { disconnected = true; } };
    const gateway = new ProctorGateway(service, jwt, config, { user: { findUnique: async () => null } });
    await assert.rejects(gateway.handleEvent(client, { attemptId: 'a', type: 'tab_switch' }), WsException);
    assert.equal(disconnected, true);
  }
});
test('socket uses current DB role, not a stale role from JWT', async () => {
  const key = 'd'.repeat(64);
  const jwt = new JwtService();
  const token = jwt.sign({ sub: 'student', role: 'PROCTOR', ver: 0 }, { secret: key, expiresIn: '15m' });
  const f = fixture();
  const gateway = new ProctorGateway(f.proctor, jwt, new ConfigService({ JWT_ACCESS_SECRET: key }), { user: { findUnique: async () => ({ id: 'student', role: 'STUDENT', tokenVersion: 0 }) } });
  const client = { data: {}, handshake: { headers: { origin: 'http://localhost:3000', cookie: `pl-access=${token}` } }, emit() {}, disconnect() {}, join() { assert.fail('must not join'); } };
  await assert.rejects(gateway.handleStart(client, { attemptId: 'attempt', role: 'proctor' }), WsException);
  gateway.handleDisconnect(client);
});

test('pending review result never suggests that a certificate has already been issued', async () => {
  const f = fixture();
  f.prisma.course.findMany = async () => { throw new Error('unavailable'); };
  const result = await f.service.submitAnswers('attempt', valid, 'student');
  assert.equal(result.passed, true);
  assert.deepEqual(result.availableCourses, []);
  assert.equal(result.certificatePending, true);
  assert.equal(f.writes.filter(([kind]) => kind === 'certificate').length, 0);
});
