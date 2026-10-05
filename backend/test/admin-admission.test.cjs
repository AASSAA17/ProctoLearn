const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { AdminService } = require('../src/admin/admin.service');
const { EnrollmentsService } = require('../src/enrollments/enrollments.service');

function fixture() {
  const writes = [];
  const db = {
    auditEvent: { create: async ({ data }) => { assert.equal(data.actorId, 'administrator'); writes.push(['audit', data]); return data; } },
    userNotification: { createMany: async ({ data }) => { writes.push(['notification', data]); return { count: data.length }; } },
    $transaction: async (work, options) => { assert.equal(options.isolationLevel, 'Serializable'); return work(db); },
    user: { findUnique: async () => ({ id: 'student', role: 'STUDENT' }) },
    course: { findUnique: async () => ({ id: 'course' }) },
    enrollment: {
      upsert: async (query) => { writes.push(['enrollment', query]); return query.create; },
      findUnique: async () => ({ userId: 'student', courseId: 'course', completedAt: null }),
      update: async (query) => { writes.push(['complete', query]); return query.data; },
    },
    lessonProgress: { upsert: () => assert.fail('administrative exemptions must not invent student activity') },
    certificate: { findFirst: async () => null },
  };
  const certificates = { issue: async (userId, courseId, tx, source) => {
    assert.equal(tx, db); assert.equal(source, 'ADMIN_OVERRIDE');
    writes.push(['certificate', source]); return { id: 'certificate', issuedVia: source };
  } };
  return { db, writes, service: new AdminService(db, {}, certificates), enrollments: new EnrollmentsService(db) };
}

test('admin exam admission records an explicit exemption without fabricated lesson progress', async () => {
  const f = fixture();
  await f.service.grantExamAccess('student', 'course', 'administrator');
  const grant = f.writes[0][1].create;
  assert.equal(grant.examAccessGrantedBy, 'administrator');
  assert.ok(grant.examAccessGrantedAt instanceof Date);
  assert.equal(grant.completedAt, undefined);
  assert.equal(f.writes.length, 3);
  assert.equal(f.writes[1][1].action, 'ADMIN_EXAM_ACCESS_GRANTED');
});

test('admin certificate override uses the same transaction and a distinct issuance source', async () => {
  const f = fixture();
  const result = await f.service.grantFullCertificate('student', 'course', 'administrator');
  assert.equal(result.certificate.issuedVia, 'ADMIN_OVERRIDE');
  assert.deepEqual(f.writes.map(([type]) => type), ['enrollment', 'certificate', 'audit', 'notification']);
  assert.equal(f.writes[2][1].action, 'ADMIN_CERTIFICATE_GRANTED');
  assert.equal(f.writes[0][1].update.examAccessGrantedBy, 'administrator');
});

test('admin admission cannot grant staff student enrollment or certificates', async () => {
  for (const role of ['TEACHER', 'PROCTOR', 'ADMIN']) {
    const f = fixture();
    f.db.user.findUnique = async () => ({ id: 'staff', role });
    await assert.rejects(f.service.grantExamAccess('staff', 'course', 'administrator'), (e) => e.getStatus() === 403);
    await assert.rejects(f.service.grantFullCertificate('staff', 'course', 'administrator'), (e) => e.getStatus() === 403);
    assert.deepEqual(f.writes, []);
  }
});

test('student completion endpoint cannot manufacture course completion before a certificate exists', async () => {
  const f = fixture();
  await assert.rejects(f.enrollments.completeEnrollment('student', 'course'), (e) => e.getStatus() === 403);
  assert.equal(f.writes.length, 0);
  f.db.certificate.findFirst = async () => ({ id: 'certificate' });
  await f.enrollments.completeEnrollment('student', 'course');
  assert.equal(f.writes[0][0], 'complete');
});

test('admin course progress counts direct and module-backed lessons with the same membership', async () => {
  const counts = [];
  const db = {
    user: { findUnique: async () => ({ id: 'student', name: 'Student', email: 'student@example.invalid' }) },
    lessonProgress: { findMany: async () => [
      { courseId: 'module-course', viewedAt: new Date('2026-01-02'), course: { id: 'module-course', title: 'Module course' }, lesson: { id: 'module-1', title: 'Module 1', order: 1 } },
      { courseId: 'module-course', viewedAt: new Date('2026-01-03'), course: { id: 'module-course', title: 'Module course' }, lesson: { id: 'module-2', title: 'Module 2', order: 2 } },
      { courseId: 'mixed-course', viewedAt: new Date('2026-01-04'), course: { id: 'mixed-course', title: 'Mixed course' }, lesson: { id: 'direct-1', title: 'Direct 1', order: 1 } },
    ] },
    lesson: { count: async ({ where }) => {
      counts.push(where);
      return where.OR[0].courseId === 'module-course' ? 2 : 4;
    } },
  };
  const service = new AdminService(db, {}, {});
  const result = await service.getUserCourseProgress('student');
  assert.deepEqual(counts, [
    { OR: [{ courseId: 'module-course' }, { module: { courseId: 'module-course' } }] },
    { OR: [{ courseId: 'mixed-course' }, { module: { courseId: 'mixed-course' } }] },
  ]);
  assert.deepEqual(result.courses.map(({ courseId, totalLessons, progress }) => ({ courseId, totalLessons, progress })), [
    { courseId: 'module-course', totalLessons: 2, progress: 100 },
    { courseId: 'mixed-course', totalLessons: 4, progress: 25 },
  ]);
});

test('admin course progress returns zero when no current lessons are counted', async () => {
  const db = {
    user: { findUnique: async () => ({ id: 'student', name: 'Student', email: 'student@example.invalid' }) },
    lessonProgress: { findMany: async () => [
      { courseId: 'legacy-course', viewedAt: new Date(), course: { id: 'legacy-course', title: 'Legacy course' }, lesson: { id: 'deleted-lesson', title: 'Deleted', order: 1 } },
    ] },
    lesson: { count: async () => 0 },
  };
  const result = await new AdminService(db, {}, {}).getUserCourseProgress('student');
  assert.equal(result.courses[0].totalLessons, 0);
  assert.equal(result.courses[0].progress, 0);
});
