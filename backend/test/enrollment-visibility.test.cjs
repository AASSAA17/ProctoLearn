const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { ConfigService } = require('@nestjs/config');
const { ForbiddenException } = require('@nestjs/common');
const { EnrollmentsService } = require('../src/enrollments/enrollments.service');

for (const mode of ['false', 'true']) test(`withdrawn enrollment stays inactive when PILOT_MODE=${mode}`, async () => {
  const withdrawn = { id: 'preserved-enrollment', userId: 'fictional-student', courseId: 'course', accessStatus: 'WITHDRAWN', completedAt: null };
  const db = { enrollment: {
    findUnique: async ({ where }) => { assert.deepEqual(where, { userId_courseId: { userId: 'fictional-student', courseId: 'course' } }); return withdrawn; },
    findMany: async ({ where }) => { assert.deepEqual(where, { userId: 'fictional-student', accessStatus: 'ACTIVE' }); return []; },
  } };
  const service = new EnrollmentsService(db, new ConfigService({ PILOT_MODE: mode }));
  assert.deepEqual(await service.getMyEnrollments('fictional-student'), []);
  assert.deepEqual(await service.checkEnrollment('fictional-student', 'course'), { enrolled: false, completed: false, enrollment: null });
  await assert.rejects(service.completeEnrollment('fictional-student', 'course'), ForbiddenException);
  assert.equal(withdrawn.id, 'preserved-enrollment');
});
