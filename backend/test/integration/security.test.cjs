const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');

// Never fall back to DATABASE_URL or to credentials from project backups.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('Set TEST_DATABASE_URL to the dedicated local proctolearn_security_test database');
const parsed = new URL(testUrl);
if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/proctolearn_security_test') {
  throw new Error('Integration tests require a local database named proctolearn_security_test');
}
const { PrismaClient } = require('@prisma/client');
const { ConfigService } = require('@nestjs/config');
const { AttemptsService } = require('../../src/attempts/attempts.service');
const { CertificatesService } = require('../../src/certificates/certificates.service');
const { ProctorService } = require('../../src/proctor/proctor.service');
const { AuthService } = require('../../src/auth/auth.service');
const { JwtStrategy } = require('../../src/auth/strategies/jwt.strategy');
const { JwtService } = require('@nestjs/jwt');
const { tokenDigest } = require('../../src/auth/token-digest');
const bcrypt = require('bcryptjs');

test('PostgreSQL transaction and authorization regressions', async (t) => {
  const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
  const teacherId = randomUUID();
  const studentId = randomUUID();
  const courseId = randomUUID();
  const examId = randomUUID();
  const q1 = randomUUID();
  const q2 = randomUUID();
  const service = new AttemptsService(db, new CertificatesService(db), new ConfigService({}));
  const proctor = new ProctorService(db);
  const answers = { answers: [{ questionId: q1, answer: 'A' }, { questionId: q2, answer: 'A' }] };
  let attempt;
  try {
    await db.user.createMany({ data: [
      { id: teacherId, name: 'Test teacher', email: `${teacherId}@example.invalid`, password: 'not-a-login-hash', role: 'TEACHER' },
      { id: studentId, name: 'Test student', email: `${studentId}@example.invalid`, password: 'not-a-login-hash' },
    ] });
    await db.course.create({ data: { id: courseId, title: 'Security test fixture', teacherId } });
    await db.enrollment.create({ data: { courseId, userId: studentId } });
    await db.exam.create({ data: { id: examId, courseId, title: 'Test', duration: 30, questions: { create: [
      { id: q1, text: 'One', type: 'SINGLE_CHOICE', answer: 'A' },
      { id: q2, text: 'Two', type: 'SINGLE_CHOICE', answer: 'A' },
    ] } } });

    await t.test('concurrent starts reuse one active attempt', async () => {
      const results = await Promise.all([service.startAttempt(examId, studentId), service.startAttempt(examId, studentId)]);
      assert.equal(results[0].id, results[1].id);
      assert.equal(await db.attempt.count({ where: { examId, userId: studentId } }), 1);
      attempt = results[0];
    });
    await t.test('duplicate answers cannot inflate score in the database', async () => {
      await assert.rejects(service.submitAnswers(attempt.id, { answers: [answers.answers[0], answers.answers[0]] }, studentId));
      assert.equal(await db.answer.count({ where: { attemptId: attempt.id } }), 0);
    });
    await t.test('foreign events never reach the database', async () => {
      await assert.rejects(proctor.recordEvent(attempt.id, teacherId, 'tab_switch'));
      assert.equal(await db.proctorEvent.count({ where: { attemptId: attempt.id } }), 0);
    });
    await t.test('concurrent events both deduct trust, with no lost update', async () => {
      await Promise.all([
        proctor.recordEvent(attempt.id, studentId, 'tab_switch'),
        proctor.recordEvent(attempt.id, studentId, 'tab_switch'),
      ]);
      assert.equal((await db.attempt.findUnique({ where: { id: attempt.id } })).trustScore, 80);
      assert.equal(await db.proctorEvent.count({ where: { attemptId: attempt.id } }), 2);
    });
    await t.test('concurrent submissions persist exactly one result and certificate', async () => {
      const results = await Promise.allSettled([
        service.submitAnswers(attempt.id, answers, studentId),
        service.submitAnswers(attempt.id, answers, studentId),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(await db.answer.count({ where: { attemptId: attempt.id } }), 2);
      assert.equal(await db.certificate.count({ where: { userId: studentId, courseId } }), 1);
    });
    await t.test('certificate failure rolls back grade and answers', async () => {
      const next = await db.attempt.create({ data: { examId, userId: studentId } });
      const failing = new AttemptsService(db, { issue: async () => { throw new Error('Simulated failure'); } }, new ConfigService({}));
      await assert.rejects(failing.submitAnswers(next.id, answers, studentId), /Simulated failure/);
      assert.equal((await db.attempt.findUnique({ where: { id: next.id } })).status, 'IN_PROGRESS');
      assert.equal(await db.answer.count({ where: { attemptId: next.id } }), 0);
    });
    await t.test('expired attempt closes without accepting late answers', async () => {
      const late = await db.attempt.create({ data: { examId, userId: studentId, startedAt: new Date(0) } });
      await assert.rejects(service.submitAnswers(late.id, answers, studentId), (e) => e.getResponse?.().code === 'EXAM_EXPIRED');
      assert.equal((await db.attempt.findUnique({ where: { id: late.id } })).status, 'FAILED');
      assert.equal(await db.answer.count({ where: { attemptId: late.id } }), 0);
    });
    const authConfig = new ConfigService({ JWT_ACCESS_SECRET: 'a'.repeat(64), JWT_REFRESH_SECRET: 'b'.repeat(64) });
    const jwt = new JwtService();
    const auth = new AuthService(db, jwt, authConfig, {});
    const student = await db.user.update({ where: { id: studentId }, data: { password: await bcrypt.hash('Test!!12', 4) } });
    const login = () => auth.login({ email: student.email, password: 'Test!!12' });
    await t.test('simultaneous refreshes consume the database token only once', async () => {
      const tokens = await login();
      const results = await Promise.allSettled([auth.refresh(tokens.refreshToken), auth.refresh(tokens.refreshToken)]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
      await assert.rejects(auth.refresh(tokens.refreshToken));
    });
    await t.test('a refresh racing logout cannot keep a session alive', async () => {
      const tokens = await login();
      const [refresh] = await Promise.allSettled([auth.refresh(tokens.refreshToken), auth.logout(studentId)]);
      const strategy = new JwtStrategy(authConfig, db);
      await assert.rejects(strategy.validate(jwt.decode(tokens.accessToken)));
      if (refresh.status === 'fulfilled') {
        await assert.rejects(strategy.validate(jwt.decode(refresh.value.accessToken)));
        await assert.rejects(auth.refresh(refresh.value.refreshToken));
      }
      assert.equal((await db.user.findUnique({ where: { id: studentId } })).refreshToken, null);
    });
    await t.test('simultaneous password resets consume a link atomically', async () => {
      const token = randomUUID();
      const before = await db.user.findUnique({ where: { id: studentId } });
      await db.passwordResetToken.create({ data: { userId: studentId, token: tokenDigest(token), expiresAt: new Date(Date.now() + 60_000) } });
      const results = await Promise.allSettled([
        auth.resetPassword({ token, newPassword: 'First!!34' }),
        auth.resetPassword({ token, newPassword: 'Second!!56' }),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
      assert.equal((await db.user.findUnique({ where: { id: studentId } })).tokenVersion, before.tokenVersion + 1);
      assert.equal(await db.passwordResetToken.count({ where: { userId: studentId } }), 0);
    });
  } finally {
    // Only remove fixtures created by this run. No reset, truncate, or broad delete.
    await db.attempt.deleteMany({ where: { examId, userId: studentId } });
    await db.certificate.deleteMany({ where: { courseId, userId: studentId } });
    await db.course.deleteMany({ where: { id: courseId } });
    await db.user.deleteMany({ where: { id: { in: [teacherId, studentId] } } });
    await db.$disconnect();
  }
});
