const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');

// This suite never reads application DATABASE_URL or resets any existing data.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('Set TEST_DATABASE_URL to the dedicated local proctolearn_security_test database');
const parsed = new URL(testUrl);
if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/proctolearn_security_test') {
  throw new Error('Appeal integration tests require a local database named proctolearn_security_test');
}
const { PrismaClient } = require('@prisma/client');
const { ProctorService } = require('../../src/proctor/proctor.service');
const { CertificatesService } = require('../../src/certificates/certificates.service');
const { AttemptsService } = require('../../src/attempts/attempts.service');
const status = (code) => (error) => error.getStatus?.() === code;
const reason = { reason: 'Please independently review the recovered recordings' };
const rejected = { decision: 'REJECTED', reason: 'Recording requires independent verification' };
const overturn = { decision: 'OVERTURNED', reason: 'Recovered camera and screen support approval' };
const uphold = { decision: 'UPHELD', reason: 'Evidence confirms the original rejection' };

test('PostgreSQL appeals preserve independent, atomic and idempotent review decisions', async (t) => {
  const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
  const [teacherId, studentId, originalId, independentId, outsiderId] = Array.from({ length: 5 }, randomUUID);
  const userIds = [teacherId, studentId, originalId, independentId, outsiderId];
  const courseIds = [], attemptIds = [];
  const certificates = new CertificatesService(db);
  const service = new ProctorService(db, certificates);
  const owner = { id: studentId, role: 'STUDENT' };
  const original = { id: originalId, role: 'PROCTOR' };
  const independent = { id: independentId, role: 'PROCTOR' };

  async function scenario({ score = 80, snapshotPassScore = 70, recordings = ['camera', 'screen'], open = true } = {}) {
    const courseId = randomUUID(), examId = randomUUID(), attemptId = randomUUID();
    courseIds.push(courseId); attemptIds.push(attemptId);
    await db.course.create({ data: { id: courseId, teacherId, title: 'Appeal integration fixture' } });
    await db.enrollment.create({ data: { courseId, userId: studentId } });
    await db.exam.create({ data: { id: examId, courseId, title: 'Live exam', duration: 10, passScore: 1,
      proctorAssignments: { create: [{ proctorId: originalId }, { proctorId: independentId }] } } });
    await db.attempt.create({ data: { id: attemptId, examId, userId: studentId, score, status: 'FINISHED', finishedAt: new Date(),
      examSnapshot: { id: examId, courseId, title: 'Frozen exam', duration: 30, passScore: snapshotPassScore, questions: [] } } });
    const files = [];
    for (const kind of recordings) files.push(await db.evidenceFile.create({ data: {
      attemptId, type: `recording_${kind}`, url: `recordings/${attemptId}/${kind}.webm`,
    } }));
    await service.reviewAttempt(attemptId, original, rejected);
    if (open) await service.createAppeal(attemptId, owner, reason);
    return {
      courseId, examId, attemptId, files,
      attempt: () => db.attempt.findUnique({ where: { id: attemptId } }),
      appeal: () => db.attemptAppeal.findUnique({ where: { attemptId } }),
      reviews: () => db.attemptReview.findMany({ where: { attemptId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      certificateCount: () => db.certificate.count({ where: { userId: studentId, courseId } }),
      enrollment: () => db.enrollment.findUnique({ where: { userId_courseId: { userId: studentId, courseId } } }),
      upload: (data) => db.recordingUpload.create({ data: {
        attemptId, kind: 'camera', mimeType: 'video/webm', clientSessionId: randomUUID(), expiresAt: new Date(Date.now() + 60_000), ...data,
      } }),
    };
  }

  try {
    await db.user.createMany({ data: userIds.map((id, index) => ({ id, name: 'Appeal fixture', email: `${id}@example.invalid`,
      password: 'not-a-login-hash', role: ['TEACHER', 'STUDENT', 'PROCTOR', 'PROCTOR', 'PROCTOR'][index] })) });

    await t.test('concurrent identical creation returns one appeal and conflicting creation cannot replace it', async () => {
      const f = await scenario({ open: false });
      const [first, second] = await Promise.all([service.createAppeal(f.attemptId, owner, reason), service.createAppeal(f.attemptId, owner, reason)]);
      assert.deepEqual(first, second);
      assert.equal(await db.attemptAppeal.count({ where: { attemptId: f.attemptId } }), 1);
      await assert.rejects(service.createAppeal(f.attemptId, owner, { reason: 'Replacement appeal' }), status(409));
      assert.equal((await f.reviews()).length, 1);
      assert.equal(await f.certificateCount(), 0);
    });

    await t.test('concurrent overturn retries issue exactly one certificate and append one audit decision', async () => {
      const f = await scenario();
      const initial = (await f.reviews())[0];
      const [first, second] = await Promise.all([service.resolveAppeal(f.attemptId, independent, overturn), service.resolveAppeal(f.attemptId, independent, overturn)]);
      assert.deepEqual(first, second); assert.equal(first.certificateIssued, true);
      assert.equal(await f.certificateCount(), 1); assert.ok((await f.enrollment()).completedAt);
      assert.equal((await f.attempt()).reviewStatus, 'APPROVED'); assert.equal((await f.attempt()).reviewedBy, independentId);
      assert.equal((await f.appeal()).decidedBy, independentId);
      const history = await f.reviews(); assert.equal(history.length, 2); assert.deepEqual(history[0], initial);
      assert.equal(history[1].source, 'APPEAL'); assert.equal(history[1].decision, 'OVERTURNED');
      assert.equal((await service.createAppeal(f.attemptId, owner, reason)).state, 'OVERTURNED');
      await assert.rejects(service.resolveAppeal(f.attemptId, original, overturn), status(403));
    });

    await t.test('concurrent opposing resolutions have one winner and cannot rewrite audit', async () => {
      const f = await scenario();
      const results = await Promise.allSettled([service.resolveAppeal(f.attemptId, independent, overturn), service.resolveAppeal(f.attemptId, independent, uphold)]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.find((result) => result.status === 'rejected').reason.getStatus(), 409);
      const appeal = await f.appeal(); const approved = appeal.state === 'OVERTURNED';
      assert.equal((await f.attempt()).reviewStatus, approved ? 'APPROVED' : 'REJECTED');
      assert.equal(await f.certificateCount(), approved ? 1 : 0);
      assert.equal(!!(await f.enrollment()).completedAt, approved);
      assert.equal((await f.reviews()).length, 2);
    });

    await t.test('missing recordings and frozen failing threshold roll back the entire overturn', async () => {
      for (const options of [{ recordings: ['camera'] }, { score: 69, snapshotPassScore: 70 }]) {
        const f = await scenario(options);
        await assert.rejects(service.resolveAppeal(f.attemptId, independent, overturn), status(409));
        assert.equal((await f.appeal()).state, 'OPEN'); assert.equal((await f.appeal()).decidedAt, null);
        assert.equal((await f.attempt()).reviewStatus, 'REJECTED'); assert.equal((await f.attempt()).reviewedBy, originalId);
        assert.equal((await f.reviews()).length, 1); assert.equal(await f.certificateCount(), 0); assert.equal((await f.enrollment()).completedAt, null);
      }
    });

    await t.test('OPEN, FINALIZING and invalid COMPLETE manifests prevent issuance until finalized', async () => {
      for (const state of ['OPEN', 'FINALIZING', 'COMPLETE']) {
        const f = await scenario(); const upload = await f.upload({ state, evidenceId: null });
        await assert.rejects(service.resolveAppeal(f.attemptId, independent, overturn), status(409));
        assert.equal((await f.appeal()).state, 'OPEN'); assert.equal(await f.certificateCount(), 0);
        await db.recordingUpload.update({ where: { id: upload.id }, data: { state: 'COMPLETE', evidenceId: f.files.find((file) => file.type === 'recording_camera').id } });
        assert.equal((await service.resolveAppeal(f.attemptId, independent, overturn)).certificateIssued, true);
      }
      const f = await scenario(); await f.upload({ state: 'ABORTED', interrupted: true });
      assert.equal((await service.resolveAppeal(f.attemptId, independent, overturn)).certificateIssued, true);
    });

    await t.test('UPHELD keeps rejection and course incomplete without requiring recordings', async () => {
      const f = await scenario({ recordings: [] });
      const result = await service.resolveAppeal(f.attemptId, independent, uphold);
      assert.equal(result.appeal.state, 'UPHELD'); assert.equal(result.certificateIssued, false);
      assert.equal((await f.attempt()).reviewedBy, originalId); assert.equal(await f.certificateCount(), 0);
      assert.equal((await f.enrollment()).completedAt, null); assert.equal((await f.reviews()).length, 2);
      assert.deepEqual(await service.resolveAppeal(f.attemptId, independent, uphold), result);
      await assert.rejects(service.resolveAppeal(f.attemptId, independent, overturn), status(409));
    });

    await t.test('self, original, teacher, unassigned and revoked reviewers cannot resolve or read private appeals', async () => {
      const f = await scenario();
      for (const actor of [original, { ...original, role: 'ADMIN' }, { ...owner, role: 'ADMIN' }, { id: outsiderId, role: 'PROCTOR' }, { id: teacherId, role: 'TEACHER' }]) {
        await assert.rejects(service.resolveAppeal(f.attemptId, actor, overturn), status(403));
      }
      for (const actor of [{ id: outsiderId, role: 'PROCTOR' }, { id: teacherId, role: 'TEACHER' }]) await assert.rejects(service.getAppeal(f.attemptId, actor), status(403));
      assert.equal((await service.getAppeal(f.attemptId, owner)).appeal.state, 'OPEN');
      await db.examProctor.delete({ where: { examId_proctorId: { examId: f.examId, proctorId: independentId } } });
      await assert.rejects(service.resolveAppeal(f.attemptId, independent, overturn), status(403));
      await assert.rejects(service.getAppeal(f.attemptId, independent), status(403));
      assert.equal((await f.appeal()).state, 'OPEN'); assert.equal(await f.certificateCount(), 0);
    });

    await t.test('audit insertion failure rolls back certificate, enrollment, decision and appeal in real PostgreSQL', async () => {
      const f = await scenario();
      const failingDb = { $transaction: (work, options) => db.$transaction((tx) => work(new Proxy(tx, {
        get(target, key) {
          if (key !== 'attemptReview') return target[key];
          return new Proxy(target.attemptReview, { get(delegate, method) {
            return method === 'create' ? async () => { throw new Error('Simulated audit storage failure'); } : delegate[method];
          } });
        },
      })), options) };
      const failingService = new ProctorService(failingDb, certificates);
      await assert.rejects(failingService.resolveAppeal(f.attemptId, independent, overturn), /Simulated audit storage failure/);
      assert.equal((await f.appeal()).state, 'OPEN'); assert.equal((await f.appeal()).decidedBy, null);
      assert.equal((await f.attempt()).reviewStatus, 'REJECTED'); assert.equal((await f.attempt()).reviewedBy, originalId);
      assert.equal(await f.certificateCount(), 0); assert.equal((await f.enrollment()).completedAt, null); assert.equal((await f.reviews()).length, 1);
    });

    await t.test('appeal grants one fixed recovery window to unfinished uploads without extending retries', async () => {
      const f = await scenario({ open: false });
      const open = await f.upload({ expiresAt: new Date(Date.now() - 60_000) });
      const aborted = await f.upload({ state: 'ABORTED', expiresAt: new Date(Date.now() - 60_000) });
      const appeal = await service.createAppeal(f.attemptId, owner, reason);
      const expiresAt = new Date(appeal.createdAt.getTime() + 24 * 60 * 60_000);
      assert.equal((await db.recordingUpload.findUnique({ where: { id: open.id } })).expiresAt.getTime(), expiresAt.getTime());
      assert.equal((await db.recordingUpload.findUnique({ where: { id: aborted.id } })).expiresAt.getTime(), aborted.expiresAt.getTime());
      await service.createAppeal(f.attemptId, owner, reason);
      assert.equal((await db.recordingUpload.findUnique({ where: { id: open.id } })).expiresAt.getTime(), expiresAt.getTime());
    });

    await t.test('appeal queue retains staff scope, pagination and a scalar public state without private payloads', async () => {
      const f = await scenario();
      const attempts = new AttemptsService(db, certificates, { get: () => undefined });
      const visible = await attempts.getAllAttempts(independent, f.examId, 1, 1, 'OPEN');
      assert.equal(visible.meta.total, 1); assert.equal(visible.meta.totalPages, 1);
      assert.equal(visible.data[0].appealState, 'OPEN');
      for (const key of ['appeal', 'history', 'reviews', 'examSnapshot', 'draftAnswers', 'submissionDigest']) assert.equal(key in visible.data[0], false, key);
      assert.equal((await attempts.getAllAttempts({ id: outsiderId, role: 'PROCTOR' }, f.examId, 1, 50, 'OPEN')).meta.total, 0);
      assert.equal((await attempts.getUserAttempts(studentId)).find((row) => row.id === f.attemptId).appealState, 'OPEN');
      await assert.rejects(attempts.getAllAttempts(independent, f.examId, 1, 50, 'INVALID'), status(400));
      await service.resolveAppeal(f.attemptId, independent, uphold);
      assert.equal((await attempts.getAllAttempts(independent, f.examId, 1, 50, 'OPEN')).meta.total, 0);
    });

    await t.test('review summary exposes interrupted upload metadata without storage keys or finalize leases', async () => {
      const f = await scenario();
      await f.upload({ state: 'FINALIZING', interrupted: true, finalizeToken: 'private-finalize-token', finalizeLeaseUntil: new Date() });
      const summary = await service.getSessionSummary(f.attemptId, independent);
      assert.equal(summary.appealState, 'OPEN'); assert.equal(summary.recordingUploads.length, 1);
      assert.equal(summary.recordingUploads[0].interrupted, true); assert.equal(summary.recordingUploads[0].state, 'FINALIZING');
      for (const key of ['chunks', 'clientSessionId', 'mimeType', 'finalizeToken', 'finalizeLeaseUntil']) assert.equal(key in summary.recordingUploads[0], false, key);
      assert.equal(JSON.stringify(summary).includes('private-finalize-token'), false);
      assert.equal(summary.history[0].source, 'INITIAL');
    });
  } finally {
    try {
      await db.attempt.deleteMany({ where: { id: { in: attemptIds } } });
      await db.certificate.deleteMany({ where: { courseId: { in: courseIds }, userId: studentId } });
      await db.course.deleteMany({ where: { id: { in: courseIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    } finally { await db.$disconnect(); }
  }
});
