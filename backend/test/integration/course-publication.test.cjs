const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { CoursesService } = require('../../src/courses/courses.service');
const { EnrollmentsService } = require('../../src/enrollments/enrollments.service');
const { LessonsService } = require('../../src/lessons/lessons.service');
const url = process.env.TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/proctolearn_security_test') throw new Error('Dedicated local test database required');

test('publication, concurrent enrollments, archive, progress and republish retain academic records', async () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const users = Array.from({ length: 4 }, () => randomUUID());
  const [teacherId, outsiderId, studentId, newStudentId] = users;
  let courseId;
  try {
    await db.user.createMany({ data: users.map((id, n) => ({ id, name: 'Publication fixture', email: `${id}@example.invalid`, password: 'not-a-login-hash', role: n < 2 ? 'TEACHER' : 'STUDENT' })) });
    const courses = new CoursesService(db);
    const enrollments = new EnrollmentsService(db);
    const lessons = new LessonsService(db);
    const owner = { id: teacherId, role: 'TEACHER' };
    const student = { id: studentId, role: 'STUDENT' };
    const course = await courses.create({ title: 'Publication fixture', description: 'Original fixture description' }, teacherId);
    courseId = course.id;
    assert.equal(course.status, 'DRAFT');
    await assert.rejects(courses.findById(courseId), e => e.getStatus() === 404);
    await assert.rejects(enrollments.enroll(studentId, courseId), e => e.getStatus() === 403);
    await assert.rejects(courses.publish(courseId, owner), e => e.getStatus() === 400);
    await assert.rejects(courses.publish(courseId, { id: outsiderId, role: 'TEACHER' }), e => e.getStatus() === 403);
    const lesson = await lessons.create(courseId, { title: 'One lesson', content: 'Original lesson text', order: 1 }, owner);
    await courses.publish(courseId, owner);
    assert.equal((await courses.findById(courseId)).status, 'PUBLISHED');
    const repeated = await Promise.all(Array.from({ length: 3 }, () => enrollments.enroll(studentId, courseId)));
    assert.equal(new Set(repeated.map(result => result.enrollment.id)).size, 1);
    assert.equal(await db.enrollment.count({ where: { userId: studentId, courseId } }), 1);
    await lessons.markCompleted(lesson.id, student, courseId);
    await courses.archive(courseId, owner);
    await assert.rejects(courses.findById(courseId), e => e.getStatus() === 404);
    await assert.rejects(enrollments.enroll(newStudentId, courseId), e => e.getStatus() === 403);
    await enrollments.enroll(studentId, courseId);
    assert.equal((await courses.getMaterial(courseId, student)).lessons[0].content, 'Original lesson text');
    assert.equal((await lessons.getMyProgress(courseId, studentId))[0].completed, true);
    await courses.remove(courseId, teacherId, 'TEACHER');
    assert.equal(await db.enrollment.count({ where: { courseId } }), 1);
    assert.equal(await db.lessonProgress.count({ where: { courseId } }), 1);
    await courses.publish(courseId, owner);
    await enrollments.enroll(newStudentId, courseId);
    assert.equal(await db.enrollment.count({ where: { courseId } }), 2);
  } finally {
    if (courseId) await db.course.deleteMany({ where: { id: courseId } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
});
