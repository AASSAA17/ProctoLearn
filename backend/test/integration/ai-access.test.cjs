const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { AiService } = require('../../src/ai/ai.service');
const { AiReadTools } = require('../../src/ai/ai.tools');
const url = process.env.TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/proctolearn_security_test') throw new Error('Dedicated local test database required');

test('AI PostgreSQL reads enforce ownership, deny hidden answers and block active exams', async () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const [teacherId, alice, bob, courseId, moduleId, directId, moduleLessonId, examId, attemptId] = Array.from({ length: 9 }, () => randomUUID());
  const ownTitle = `AI fixture ${courseId}`;
  try {
    await db.user.createMany({ data: [teacherId, alice, bob].map((id, i) => ({ id, name: 'AI fictional fixture', email: `${id}@example.invalid`, password: 'not-a-login-hash', role: i === 0 ? 'TEACHER' : 'STUDENT' })) });
    await db.course.create({ data: { id: courseId, title: ownTitle, teacherId } });
    await db.enrollment.create({ data: { courseId, userId: alice } });
    await db.courseModule.create({ data: { id: moduleId, courseId, title: 'AI module fixture', order: 0 } });
    await db.lesson.createMany({ data: [
      { id: directId, courseId, title: 'Direct lesson', content: 'not sent to model', assignmentAnswer: 'PRIVATE_SOLUTION', order: 0 },
      { id: moduleLessonId, moduleId, title: 'Module lesson', content: 'not sent to model', assignmentAnswer: 'PRIVATE_SOLUTION', order: 1 },
    ] });
    await db.lessonProgress.create({ data: { courseId, userId: alice, lessonId: moduleLessonId, completionSource: 'ASSIGNMENT' } });
    const tools = new AiReadTools(db);
    assert.equal((await tools.execute(alice, 'my_courses', {})).courses[0].title, ownTitle);
    assert.deepEqual((await tools.execute(bob, 'my_courses', {})).courses, []);
    assert.deepEqual(await tools.execute(bob, 'course_outline', { courseId }), { error: 'NOT_FOUND_OR_FORBIDDEN' });
    assert.deepEqual(await tools.execute(bob, 'my_progress', { courseId }), { error: 'NOT_FOUND_OR_FORBIDDEN' });
    const outline = await tools.execute(alice, 'course_outline', { courseId });
    assert.equal(outline.lessons.length, 2); assert.doesNotMatch(JSON.stringify(outline), /PRIVATE_SOLUTION|not sent to model|assignmentAnswer/);
    assert.equal((await tools.execute(teacherId, 'course_outline', { courseId })).lessons.length, 2);
    const progress = await tools.execute(alice, 'my_progress', { courseId });
    assert.equal(progress.totalLessons, 2); assert.equal(progress.completedLessons, 1);
    await db.exam.create({ data: { id: examId, courseId, title: 'AI fixture exam', duration: 30 } });
    await db.attempt.create({ data: { id: attemptId, examId, userId: alice } });
    const service = new AiService(db, { get: () => undefined });
    await assert.rejects(service.chat(alice, { message: 'Сәлем' }), error => error.getStatus() === 403);
    await db.attempt.update({ where: { id: attemptId }, data: { status: 'FLAGGED' } });
    await assert.rejects(service.chat(alice, { message: 'Сәлем' }), error => error.getStatus() === 403);
    assert.deepEqual((await tools.execute(alice, 'my_results', {})).results, []);
    await db.attempt.update({ where: { id: attemptId }, data: { finishedAt: new Date(), score: 70, reviewStatus: 'PENDING' } });
    const result = (await tools.execute(alice, 'my_results', {})).results[0];
    assert.equal(result.score, 70); assert.equal(result.reviewStatus, 'PENDING'); assert.equal(result.status, 'FLAGGED');
    assert.deepEqual((await tools.execute(bob, 'my_results', {})).results, []);
    const cert = await db.certificate.create({ data: { userId: alice, courseId, qrCode: `ai-${randomUUID()}`, status: 'REVOKED', revokedAt: new Date(), courseTitle: 'Original issued title', recipientName: 'Fictional learner', issuerName: 'ProctoLearn', snapshotStatus: 'CAPTURED' } });
    await db.course.update({ where: { id: courseId }, data: { title: 'Later title' } });
    assert.equal((await tools.execute(alice, 'my_certificates', {})).certificates[0].status, 'REVOKED');
    assert.equal((await tools.execute(alice, 'my_certificates', {})).certificates[0].courseTitle, 'Original issued title');
    assert.deepEqual((await tools.execute(bob, 'my_certificates', {})).certificates, []);
    assert.doesNotMatch(JSON.stringify(await tools.execute(alice, 'my_certificates', {})), /qrCode|password|revocationReason/);
    await db.certificate.delete({ where: { id: cert.id } });
    assert.match((await service.chat(alice, { message: 'Сәлем' })).reply, /не включён/);
  } finally {
    await db.certificate.deleteMany({ where: { courseId } });
    await db.attempt.deleteMany({ where: { id: attemptId } });
    await db.course.deleteMany({ where: { id: courseId } });
    await db.user.deleteMany({ where: { id: { in: [teacherId, alice, bob] } } });
    await db.$disconnect();
  }
});
