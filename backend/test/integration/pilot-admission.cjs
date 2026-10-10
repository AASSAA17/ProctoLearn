const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { ConfigService } = require('@nestjs/config');
const { PilotPolicy } = require('../../src/pilot/pilot-policy');
const { PilotService } = require('../../src/pilot/pilot.service');
const { EnrollmentsService } = require('../../src/enrollments/enrollments.service');
const { tokenDigest } = require('../../src/auth/token-digest');

const url = process.env.TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/proctolearn_security_test') {
  throw new Error('Dedicated local test database required');
}

test('database serializes pilot cohort activation and final course seat without touching durable profiles', async () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const suffix = randomUUID();
  const adminId = randomUUID();
  const teacherId = randomUUID();
  const courseId = randomUUID();
  const examId = randomUUID();
  const attemptId = randomUUID();
  const invitationIds = [];
  const studentIds = [];
  const cfg = new ConfigService({ PILOT_MODE: 'true', PILOT_MAX_PARTICIPANTS: '10', PILOT_DEFAULT_COURSE_SEATS: '1', PILOT_PUBLIC_SIGNUP: 'false' });
  const pilot = new PilotService(db, new PilotPolicy(cfg));
  const enrollments = new EnrollmentsService(db, cfg);
  try {
    await db.user.createMany({ data: [
      { id: adminId, name: 'Pilot integration admin', email: `admin-${suffix}@example.invalid`, password: 'not-a-login-hash', role: 'ADMIN' },
      { id: teacherId, name: 'Pilot integration teacher', email: `teacher-${suffix}@example.invalid`, password: 'not-a-login-hash', role: 'TEACHER' },
    ] });
    await db.course.create({ data: { id: courseId, title: `Pilot capacity ${suffix}`, teacherId, status: 'PUBLISHED', publishedAt: new Date() } });

    const invites = [];
    for (let index = 0; index < 9; index++) {
      const invite = await pilot.createInvitation(`learner-${index}-${suffix}@example.invalid`, 24, adminId);
      invitationIds.push(invite.id); invites.push(invite);
    }
    const finalSlot = await Promise.allSettled([
      pilot.createInvitation(`learner-9-${suffix}@example.invalid`, 24, adminId),
      pilot.createInvitation(`learner-10-${suffix}@example.invalid`, 24, adminId),
    ]);
    assert.equal(finalSlot.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(finalSlot.filter(result => result.status === 'rejected').length, 1);
    const tenth = finalSlot.find(result => result.status === 'fulfilled').value;
    invitationIds.push(tenth.id); invites.push(tenth);
    assert.equal(await db.pilotInvitation.count({ where: { id: { in: invitationIds }, redeemedAt: null, revokedAt: null } }), 10);

    const first = invites[0];
    const sameToken = await Promise.allSettled(['a', 'b'].map(async label => {
      const userId = randomUUID();
      const user = await pilot.registerInvited({
        userId, name: `Concurrent ${label}`, email: first.email, phone: null, password: 'not-a-login-hash',
        invitationToken: first.activationToken, refreshTokenDigest: tokenDigest(`refresh-${label}-${suffix}`),
      });
      studentIds.push(user.id); return user;
    }));
    assert.equal(sameToken.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(sameToken.filter(result => result.status === 'rejected').length, 1);
    assert.equal(await db.pilotMembership.count({ where: { invitationId: first.id } }), 1);

    const second = invites[1];
    const secondId = randomUUID();
    await pilot.registerInvited({
      userId: secondId, name: 'Second learner', email: second.email, phone: null, password: 'not-a-login-hash',
      invitationToken: second.activationToken, refreshTokenDigest: tokenDigest(`refresh-second-${suffix}`),
    });
    studentIds.push(secondId);
    const firstId = (await db.pilotMembership.findUnique({ where: { invitationId: first.id } })).userId;
    const seatRace = await Promise.allSettled([
      enrollments.enroll(firstId, courseId),
      enrollments.enroll(secondId, courseId),
    ]);
    assert.equal(seatRace.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(seatRace.filter(result => result.status === 'rejected').length, 1);
    assert.equal(await db.enrollment.count({ where: { courseId, accessStatus: 'ACTIVE' } }), 1);
    const winner = (await db.enrollment.findFirst({ where: { courseId, accessStatus: 'ACTIVE' } })).userId;
    const waiting = winner === firstId ? secondId : firstId;
    await enrollments.enroll(winner, courseId);
    assert.equal(await db.enrollment.count({ where: { courseId } }), 1, 'retry must be idempotent');

    await db.exam.create({ data: { id: examId, courseId, title: 'Withdrawal guard', duration: 1, passScore: 60 } });
    await db.attempt.create({ data: {
      id: attemptId, examId, userId: winner,
      examSnapshot: { id: examId, courseId, title: 'Withdrawal guard', duration: 1, passScore: 60, questions: [] },
    } });
    await assert.rejects(
      enrollments.withdrawByStaff(adminId, winner, courseId),
      error => error.getResponse().code === 'ACTIVE_EXAM_ATTEMPT',
    );
    assert.equal((await db.enrollment.findUnique({ where: { userId_courseId: { userId: winner, courseId } } })).accessStatus, 'ACTIVE');

    await db.attempt.update({ where: { id: attemptId }, data: { startedAt: new Date(Date.now() - 120_000) } });
    await enrollments.withdrawByStaff(adminId, winner, courseId);
    const retained = await db.enrollment.findUnique({ where: { userId_courseId: { userId: winner, courseId } } });
    assert.equal(retained.accessStatus, 'WITHDRAWN');
    assert.ok(retained.withdrawnAt);
    await enrollments.enroll(waiting, courseId);
    assert.equal(await db.enrollment.count({ where: { courseId, accessStatus: 'ACTIVE' } }), 1, 'released seat must be reusable');
    assert.equal(await db.auditEvent.count({ where: { actorId: adminId, action: 'PILOT_COURSE_WITHDRAWN', targetId: winner } }), 1);

    const storedInvites = await db.pilotInvitation.findMany({ where: { id: { in: invitationIds } }, select: { tokenDigest: true } });
    assert.ok(storedInvites.every(row => /^[0-9a-f]{64}$/.test(row.tokenDigest)));
    assert.ok(storedInvites.every(row => !invites.some(invite => invite.activationToken === row.tokenDigest)));
  } finally {
    await db.attempt.deleteMany({ where: { id: attemptId } });
    await db.exam.deleteMany({ where: { id: examId } });
    await db.enrollment.deleteMany({ where: { courseId } });
    await db.pilotMembership.deleteMany({ where: { invitationId: { in: invitationIds } } });
    await db.pilotInvitation.deleteMany({ where: { id: { in: invitationIds } } });
    await db.course.deleteMany({ where: { id: courseId } });
    await db.user.deleteMany({ where: { id: { in: [adminId, teacherId, ...studentIds] } } });
    await db.auditEvent.deleteMany({ where: { OR: [{ actorId: adminId }, { actorId: { in: studentIds } }, { targetId: { in: invitationIds } }] } });
    await db.$disconnect();
  }
});
