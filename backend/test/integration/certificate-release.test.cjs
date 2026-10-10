const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { CertificatesService } = require('../../src/certificates/certificates.service');
const { AttemptExpiryService } = require('../../src/attempts/attempt-expiry.service');
const url = process.env.TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/proctolearn_security_test') throw new Error('Dedicated local test database required');

test('certificate concurrent issuance, immutable printed facts and permanent revocation', async () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const userId = randomUUID(), teacherId = randomUUID(), courseId = randomUUID();
  try {
    await db.user.createMany({ data: [{ id: userId, name: 'Әсел Ғалымқызы Қанат', email: `${userId}@example.invalid`, password: 'fixture' }, { id: teacherId, name: 'Teacher', email: `${teacherId}@example.invalid`, password: 'fixture', role: 'TEACHER' }] });
    await db.course.create({ data: { id: courseId, teacherId, title: 'Қазақша веб-әзірлеу' } });
    const service = new CertificatesService(db);
    const issued = await Promise.all(Array.from({ length: 5 }, () => service.issue(userId, courseId)));
    assert.equal(new Set(issued.map((c) => c.id)).size, 1);
    const cert = issued[0];
    assert.equal(cert.snapshotStatus, 'CAPTURED');
    await db.user.update({ where: { id: userId }, data: { name: 'Changed current name' } });
    await db.course.update({ where: { id: courseId }, data: { title: 'Changed current course' } });
    const verified = await service.verify(cert.qrCode);
    assert.equal(verified.certificate.recipientName, 'Әсел Ғалымқызы Қанат');
    assert.equal(verified.certificate.courseTitle, 'Қазақша веб-әзірлеу');
    assert.equal(verified.certificate.issuerName, 'ProctoLearn');
    const pdf = await service.generatePdf(cert.id, userId);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    await assert.rejects(service.generatePdf(cert.id, teacherId), (e) => e.getStatus() === 404);
    await assert.rejects(db.certificate.update({ where: { id: cert.id }, data: { recipientName: 'Mutated' } }));
    await assert.rejects(db.certificate.create({ data: { userId, courseId, qrCode: randomUUID() } }), (e) => e.code === 'P2002');
    await service.revoke(cert.id, teacherId, 'Fixture revocation');
    assert.deepEqual(await service.verify(cert.qrCode), { valid: false, status: 'REVOKED' });
    assert.equal((await service.issue(userId, courseId)).status, 'REVOKED');
    await assert.rejects(db.certificate.update({ where: { id: cert.id }, data: { status: 'VALID' } }));
    await assert.rejects(db.certificate.update({ where: { id: cert.id }, data: { revocationReason: 'Replacement' } }));
    assert.equal(await db.certificate.count({ where: { userId, courseId } }), 1);
    // A preserved history can contain a separate valid certificate after an old revocation.
    const active = await db.certificate.create({ data: { userId, courseId, qrCode: randomUUID(), issuedVia: 'LEGACY' } });
    assert.equal((await service.issue(userId, courseId)).id, active.id);
  } finally {
    await db.certificate.deleteMany({ where: { userId } });
    await db.course.deleteMany({ where: { id: courseId } });
    await db.user.deleteMany({ where: { id: { in: [userId, teacherId] } } });
    await db.$disconnect();
  }
});

test('persisted expired draft is reconciled after restart without a browser request', async () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const userId = randomUUID(), courseId = randomUUID(), examId = randomUUID(), attemptId = randomUUID(), questionId = randomUUID();
  try {
    await db.user.create({ data: { id: userId, name: 'Expiry fixture', email: `${userId}@example.invalid`, password: 'fixture' } });
    await db.course.create({ data: { id: courseId, teacherId: userId, title: 'Expiry fixture' } });
    await db.exam.create({ data: { id: examId, courseId, title: 'Expiry fixture', duration: 30 } });
    await db.question.create({ data: { id: questionId, examId, text: 'Q', type: 'TEXT', answer: 'answer' } });
    await db.attempt.create({ data: { id: attemptId, userId, examId, startedAt: new Date(Date.now() - 120000),
      status: 'FLAGGED', examSnapshot: { id: examId, courseId, title: 'Saved exam', duration: 1, passScore: 60,
        questions: [{ id: questionId, text: 'Q', type: 'TEXT', options: null, answer: 'answer' }] },
      draftAnswers: [{ questionId, answer: 'answer' }], draftRevision: 3 } });
    const restarted = new AttemptExpiryService(db);
    await restarted.reconcile();
    const attempt = await db.attempt.findUnique({ where: { id: attemptId }, include: { answers: true } });
    assert.equal(attempt.status, 'FINISHED'); assert.equal(attempt.score, 100);
    assert.equal(attempt.reviewStatus, 'PENDING'); assert.equal(attempt.answers.length, 1);
    assert.equal(attempt.draftRevision, 4);
    await restarted.reconcile();
    assert.equal(await db.answer.count({ where: { attemptId } }), 1);
    assert.equal(await db.certificate.count({ where: { userId } }), 0);
  } finally {
    await db.attempt.deleteMany({ where: { id: attemptId } });
    await db.exam.deleteMany({ where: { id: examId } });
    await db.course.deleteMany({ where: { id: courseId } });
    await db.user.deleteMany({ where: { id: userId } }); await db.$disconnect();
  }
});
