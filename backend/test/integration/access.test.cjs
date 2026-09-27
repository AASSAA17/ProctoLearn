const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { ProctorService } = require('../../src/proctor/proctor.service');
const { assertProctorAccess, attemptScope } = require('../../src/proctor/proctor-access');
const url = process.env.TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/proctolearn_security_test') throw new Error('Dedicated local test database required');

test('database enforces proctor assignment scope and revocation', async () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const ids = Array.from({ length: 5 }, () => randomUUID());
  const [teacherId, studentId, proctorId, otherTeacherId, otherProctorId] = ids;
  const courseId = randomUUID();
  const examId = randomUUID();
  const attemptId = randomUUID();
  try {
    await db.user.createMany({ data: ids.map((id, i) => ({ id, name: 'Access fixture', email: `${id}@example.invalid`, password: 'not-a-login-hash', role: ['TEACHER', 'STUDENT', 'PROCTOR', 'TEACHER', 'PROCTOR'][i] })) });
    await db.course.create({ data: { id: courseId, title: 'Access fixture', teacherId } });
    await db.exam.create({ data: { id: examId, title: 'Access exam', courseId, duration: 30 } });
    await db.attempt.create({ data: { id: attemptId, examId, userId: studentId } });
    const service = new ProctorService(db);
    const teacher = { id: teacherId, role: 'TEACHER' };
    const proctor = { id: proctorId, role: 'PROCTOR' };
    await assert.rejects(assertProctorAccess(db, attemptId, proctor), (e) => e.getStatus() === 403);
    await assert.rejects(service.assign(examId, proctorId, { id: otherTeacherId, role: 'TEACHER' }), (e) => e.getStatus() === 403);
    await assert.rejects(service.assign(examId, studentId, teacher), (e) => e.getStatus() === 400);
    await service.assign(examId, proctorId, teacher);
    await service.assign(examId, proctorId, teacher);
    assert.equal(await db.examProctor.count({ where: { examId } }), 1);
    assert.equal((await assertProctorAccess(db, attemptId, proctor)).id, attemptId);
    assert.equal(await db.attempt.count({ where: attemptScope(proctor) }), 1);
    assert.equal(await db.attempt.count({ where: attemptScope({ id: otherProctorId, role: 'PROCTOR' }) }), 0);
    assert.equal(await db.attempt.count({ where: attemptScope({ id: otherTeacherId, role: 'TEACHER' }) }), 0);
    await service.unassign(examId, proctorId, teacher);
    await assert.rejects(assertProctorAccess(db, attemptId, proctor), (e) => e.getStatus() === 403);
    assert.equal(await db.attempt.count({ where: attemptScope(proctor) }), 0);
  } finally {
    await db.attempt.deleteMany({ where: { id: attemptId } });
    await db.course.deleteMany({ where: { id: courseId } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
