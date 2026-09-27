const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');

// Never use application DATABASE_URL or project .env credentials for these tests.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('Set TEST_DATABASE_URL to the dedicated local proctolearn_security_test database');
const parsed = new URL(testUrl);
if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/proctolearn_security_test') {
  throw new Error('Review integration tests require a local database named proctolearn_security_test');
}

const { PrismaClient } = require('@prisma/client');
const { CertificatesService } = require('../../src/certificates/certificates.service');
const { ProctorService } = require('../../src/proctor/proctor.service');
const approved = { decision: 'APPROVED', reason: 'Camera and screen reviewed' };
const rejected = { decision: 'REJECTED', reason: 'Required evidence is incomplete' };
const httpStatus = (status) => (error) => error.getStatus?.() === status;

test('PostgreSQL review decisions and certificate issuance are atomic', async (t) => {
  const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
  const [teacherId, studentId, proctorId, outsiderId] = Array.from({ length: 4 }, randomUUID);
  const userIds = [teacherId, studentId, proctorId, outsiderId];
  const courseIds = [];
  const attemptIds = [];
  const certificates = new CertificatesService(db);
  const service = new ProctorService(db, certificates);
  const actor = { id: proctorId, role: 'PROCTOR' };

  async function scenario({ score = 80, snapshotPassScore = 70, livePassScore = 30, recordings = ['camera', 'screen'], status = 'FINISHED' } = {}) {
    const courseId = randomUUID();
    const examId = randomUUID();
    const questionId = randomUUID();
    const attemptId = randomUUID();
    courseIds.push(courseId);
    attemptIds.push(attemptId);
    await db.course.create({ data: { id: courseId, teacherId, title: 'Review integration fixture' } });
    await db.enrollment.create({ data: { courseId, userId: studentId } });
    await db.exam.create({ data: {
      id: examId, courseId, title: 'Live changed exam', duration: 60, passScore: livePassScore,
      questions: { create: [{ id: questionId, text: 'Question', type: 'TEXT', answer: 'A' }] },
      proctorAssignments: { create: [{ proctorId }] },
    } });
    await db.attempt.create({ data: {
      id: attemptId, examId, userId: studentId, status, score,
      finishedAt: status === 'IN_PROGRESS' ? null : new Date(),
      examSnapshot: { id: examId, courseId, title: 'Frozen exam', duration: 30, passScore: snapshotPassScore,
        questions: [{ id: questionId, text: 'Question', type: 'TEXT', options: null, answer: 'A' }] },
    } });
    if (recordings.length) await db.evidenceFile.createMany({ data: recordings.map((type) => ({
      attemptId, type: `recording_${type}`, url: `recordings/${attemptId}/${type}.webm`,
    })) });
    return { courseId, examId, attemptId,
      attempt: () => db.attempt.findUnique({ where: { id: attemptId } }),
      certificateCount: () => db.certificate.count({ where: { userId: studentId, courseId } }),
      enrollment: () => db.enrollment.findUnique({ where: { userId_courseId: { userId: studentId, courseId } } }),
    };
  }

  try {
    await db.user.createMany({ data: userIds.map((id, index) => ({
      id, name: 'Review fixture', email: `${id}@example.invalid`, password: 'not-a-login-hash',
      role: ['TEACHER', 'STUDENT', 'PROCTOR', 'PROCTOR'][index],
    })) });

    await t.test('concurrent identical reviews persist one decision and exactly one certificate', async () => {
      const f = await scenario();
      const [first, second] = await Promise.all([
        service.reviewAttempt(f.attemptId, actor, approved),
        service.reviewAttempt(f.attemptId, actor, approved),
      ]);
      assert.deepEqual(second, first);
      assert.equal(first.certificateIssued, true);
      assert.equal(await f.certificateCount(), 1);
      const stored = await f.attempt();
      assert.equal(stored.reviewStatus, 'APPROVED');
      assert.equal(stored.reviewedBy, proctorId);
      assert.equal(stored.reviewReason, approved.reason);
      assert.ok(stored.reviewedAt);
      assert.ok((await f.enrollment()).completedAt);
      assert.equal((await db.certificate.findFirst({ where: { userId: studentId, courseId: f.courseId } })).issuedVia, 'PROCTORED_EXAM');
    });

    await t.test('concurrent conflicting decisions cannot overwrite the winner', async () => {
      const f = await scenario();
      const results = await Promise.allSettled([
        service.reviewAttempt(f.attemptId, actor, approved),
        service.reviewAttempt(f.attemptId, actor, rejected),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const loser = results.find((result) => result.status === 'rejected');
      assert.equal(loser.reason.getStatus(), 409);
      const stored = await f.attempt();
      assert.ok(['APPROVED', 'REJECTED'].includes(stored.reviewStatus));
      assert.equal(await f.certificateCount(), stored.reviewStatus === 'APPROVED' ? 1 : 0);
      assert.equal(!!(await f.enrollment()).completedAt, stored.reviewStatus === 'APPROVED');
    });

    await t.test('missing evidence rolls back approval and rejection creates no certificate', async () => {
      const f = await scenario({ recordings: ['camera'] });
      await assert.rejects(service.reviewAttempt(f.attemptId, actor, approved), httpStatus(409));
      const pending = await f.attempt();
      assert.equal(pending.reviewStatus, 'PENDING');
      assert.equal(pending.reviewedBy, null);
      assert.equal(pending.reviewedAt, null);
      assert.equal(pending.reviewReason, null);
      assert.equal(await f.certificateCount(), 0);
      assert.equal((await f.enrollment()).completedAt, null);
      const result = await service.reviewAttempt(f.attemptId, actor, rejected);
      assert.equal(result.reviewStatus, 'REJECTED');
      assert.equal(result.certificateIssued, false);
      assert.equal(await f.certificateCount(), 0);
      assert.equal((await f.enrollment()).completedAt, null);
    });

    await t.test('frozen passing threshold governs approval after an exam edit', async () => {
      const fail = await scenario({ score: 60, snapshotPassScore: 70, livePassScore: 1 });
      await assert.rejects(service.reviewAttempt(fail.attemptId, actor, approved), httpStatus(409));
      assert.equal((await fail.attempt()).reviewStatus, 'PENDING');
      assert.equal(await fail.certificateCount(), 0);
      const pass = await scenario({ score: 80, snapshotPassScore: 70, livePassScore: 100 });
      assert.equal((await service.reviewAttempt(pass.attemptId, actor, approved)).certificateIssued, true);
      assert.equal(await pass.certificateCount(), 1);
    });

    await t.test('self review, unassigned review and review before submission cannot persist', async () => {
      const f = await scenario();
      await assert.rejects(service.reviewAttempt(f.attemptId, { id: studentId, role: 'ADMIN' }, approved), httpStatus(403));
      await assert.rejects(service.reviewAttempt(f.attemptId, { id: outsiderId, role: 'PROCTOR' }, approved), httpStatus(403));
      await db.examProctor.delete({ where: { examId_proctorId: { examId: f.examId, proctorId } } });
      await assert.rejects(service.reviewAttempt(f.attemptId, actor, approved), httpStatus(403));
      assert.equal((await f.attempt()).reviewStatus, 'PENDING');
      assert.equal(await f.certificateCount(), 0);
      const active = await scenario({ status: 'IN_PROGRESS', score: null });
      await assert.rejects(service.reviewAttempt(active.attemptId, actor, rejected), httpStatus(409));
      await assert.rejects(certificates.issueForAttempt(active.attemptId), httpStatus(409));
      assert.equal((await active.attempt()).reviewStatus, 'PENDING');
      assert.equal(await active.certificateCount(), 0);
    });

    await t.test('certificate insertion failure rolls back review audit fields in PostgreSQL', async () => {
      const f = await scenario();
      const failingDb = { $transaction: (work, options) => db.$transaction((tx) => work(new Proxy(tx, {
        get(target, key) {
          if (key !== 'certificate') return target[key];
          return new Proxy(target.certificate, { get(delegate, method) {
            return method === 'create' ? async () => { throw new Error('Simulated certificate failure'); } : delegate[method];
          } });
        },
      })), options) };
      const failingService = new ProctorService(failingDb, certificates);
      await assert.rejects(failingService.reviewAttempt(f.attemptId, actor, approved), /Simulated certificate failure/);
      const pending = await f.attempt();
      assert.equal(pending.reviewStatus, 'PENDING');
      assert.equal(pending.reviewedAt, null);
      assert.equal(pending.reviewedBy, null);
      assert.equal(pending.reviewReason, null);
      assert.equal(await f.certificateCount(), 0);
      assert.equal((await f.enrollment()).completedAt, null);
    });

    await t.test('enrollment failure also rolls back the inserted certificate and review', async () => {
      const f = await scenario();
      const failingDb = { $transaction: (work, options) => db.$transaction((tx) => work(new Proxy(tx, {
        get(target, key) { return key === 'enrollment' ? { updateMany: async () => { throw new Error('Simulated enrollment failure'); } } : target[key]; },
      })), options) };
      const failingService = new ProctorService(failingDb, certificates);
      await assert.rejects(failingService.reviewAttempt(f.attemptId, actor, approved), /Simulated enrollment failure/);
      assert.equal((await f.attempt()).reviewStatus, 'PENDING');
      assert.equal((await f.attempt()).reviewedAt, null);
      assert.equal(await f.certificateCount(), 0);
      assert.equal((await f.enrollment()).completedAt, null);
    });
  } finally {
    // Delete only random fixture IDs owned by this run. Never reset the schema.
    try {
      await db.attempt.deleteMany({ where: { id: { in: attemptIds } } });
      await db.certificate.deleteMany({ where: { courseId: { in: courseIds }, userId: studentId } });
      await db.course.deleteMany({ where: { id: { in: courseIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    } finally { await db.$disconnect(); }
  }
});
