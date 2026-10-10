const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { ConfigService } = require('@nestjs/config');
const { ValidationPipe, BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } = require('@nestjs/common');
const { GUARDS_METADATA, HEADERS_METADATA } = require('@nestjs/common/constants');
const { PilotPolicy, pilotSettings } = require('../src/pilot/pilot-policy');
const { PilotService } = require('../src/pilot/pilot.service');
const { PilotController } = require('../src/pilot/pilot.controller');
const { CreatePilotInvitationDto, SuspendPilotMemberDto } = require('../src/pilot/pilot.dto');
const { EnrollmentsService } = require('../src/enrollments/enrollments.service');
const { JwtStrategy } = require('../src/auth/strategies/jwt.strategy');
const { AuthService } = require('../src/auth/auth.service');
const { JwtService } = require('@nestjs/jwt');
const { JwtAuthGuard } = require('../src/common/guards/jwt-auth.guard');
const { RolesGuard } = require('../src/common/guards/roles.guard');
const { tokenDigest } = require('../src/auth/token-digest');

const config = (values = {}) => new ConfigService({
  JWT_ACCESS_SECRET: 'a'.repeat(64), JWT_REFRESH_SECRET: 'b'.repeat(64), ...values,
});

function pilotDb() {
  const state = { users: [], invitations: [], memberships: [], audits: [] };
  let sequence = 0;
  const matchesActive = (row, where) => row.redeemedAt === null && row.revokedAt === null && row.expiresAt > where.expiresAt.gt;
  const tx = {
    user: {
      findUnique: async ({ where }) => state.users.find(row => row.email === where.email || row.id === where.id) ?? null,
      create: async ({ data }) => {
        if (state.users.some(row => row.email === data.email)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        const row = { id: `user-${++sequence}`, createdAt: new Date(), mustChangePassword: false, tokenVersion: 0, refreshToken: null, ...data };
        state.users.push(row); return { ...row };
      },
      update: async ({ where, data }) => {
        const row = state.users.find(item => item.id === where.id);
        if (data.tokenVersion?.increment) row.tokenVersion += data.tokenVersion.increment;
        Object.assign(row, { ...data, tokenVersion: row.tokenVersion }); return { ...row };
      },
    },
    pilotInvitation: {
      findFirst: async ({ where }) => state.invitations.find(row => row.email === where.email && matchesActive(row, where)) ?? null,
      count: async ({ where }) => state.invitations.filter(row => matchesActive(row, where)).length,
      create: async ({ data }) => { const row = { id: `invite-${++sequence}`, createdAt: new Date(), redeemedAt: null, redeemedById: null, revokedAt: null, ...data }; state.invitations.push(row); return { ...row }; },
      findUnique: async ({ where }) => state.invitations.find(row => row.id === where.id || row.tokenDigest === where.tokenDigest) ?? null,
      updateMany: async ({ where, data }) => {
        const row = state.invitations.find(item => item.id === where.id && item.tokenDigest === where.tokenDigest && matchesActive(item, where));
        if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 };
      },
      update: async ({ where, data }) => { const row = state.invitations.find(item => item.id === where.id); Object.assign(row, data); return { ...row }; },
    },
    pilotMembership: {
      count: async () => state.memberships.length,
      create: async ({ data }) => { const row = { id: `member-${++sequence}`, status: 'ACTIVE', joinedAt: new Date(), suspendedAt: null, suspendedById: null, suspensionReason: null, ...data }; state.memberships.push(row); return { ...row }; },
      findUnique: async ({ where }) => state.memberships.find(row => row.userId === where.userId) ?? null,
      update: async ({ where, data }) => { const row = state.memberships.find(item => item.userId === where.userId); Object.assign(row, data); return { ...row }; },
    },
    auditEvent: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
  return { state, ...tx, $transaction: async (work, options) => { assert.equal(options.isolationLevel, 'Serializable'); return work(tx); } };
}

test('pilot settings default closed and reject open public signup or invalid capacities', () => {
  assert.deepEqual(pilotSettings(config()), { enabled: false, maxParticipants: 10, defaultCourseSeats: 10, publicSignup: false });
  assert.throws(() => pilotSettings(config({ PILOT_MODE: 'true', PILOT_PUBLIC_SIGNUP: 'true' })), /must be false/);
  for (const value of ['0', '1.5', 'many', '101']) {
    assert.throws(() => pilotSettings(config({ PILOT_MAX_PARTICIPANTS: value })), /PILOT_MAX_PARTICIPANTS/);
  }
});

test('invitation activation stores only a digest, is single-use, and creates membership atomically', async () => {
  const db = pilotDb();
  db.state.users.push({ id: 'admin', email: 'owner@example.invalid', tokenVersion: 0 });
  const service = new PilotService(db, new PilotPolicy(config({ PILOT_MODE: 'true' })));
  const invitation = await service.createInvitation(' Learner@Example.Invalid ', 2, 'admin');
  assert.equal(invitation.email, 'learner@example.invalid');
  assert.equal(invitation.activationToken.length, 43);
  assert.equal(db.state.invitations[0].tokenDigest, tokenDigest(invitation.activationToken));
  assert.equal(JSON.stringify(db.state).includes(invitation.activationToken), false);
  const user = await service.registerInvited({
    userId: 'invited-user', name: 'Оқушы', email: invitation.email, phone: null, password: 'already-hashed', invitationToken: invitation.activationToken, refreshTokenDigest: 'refresh-digest',
  });
  assert.equal(user.role, 'STUDENT');
  assert.equal(db.state.memberships[0].userId, user.id);
  await assert.rejects(service.registerInvited({
    userId: 'duplicate-user', name: 'Оқушы', email: invitation.email, phone: null, password: 'already-hashed', invitationToken: invitation.activationToken, refreshTokenDigest: 'refresh-digest-2',
  }), ForbiddenException);
  assert.equal(db.state.users.filter(row => row.role === 'STUDENT').length, 1);
});

test('invited registration binds the refresh digest to the same account transaction', async () => {
  let registration;
  const pilot = {
    enabled: true,
    assertRegistrationInvitation: async () => {},
    registerInvited: async input => {
      registration = input;
      return { id: input.userId, name: input.name, email: input.email, phone: input.phone, role: 'STUDENT', createdAt: new Date(), mustChangePassword: false, tokenVersion: 0 };
    },
  };
  const jwt = new JwtService();
  const service = new AuthService({ user: { findUnique: async () => null } }, jwt, config(), {}, pilot);
  const session = await service.register({ name: 'Оқушы', email: 'LEARNER@example.invalid', password: 'Strong!!123', invitationToken: 't'.repeat(43) });
  assert.equal(registration.email, 'learner@example.invalid');
  assert.equal(registration.refreshTokenDigest, tokenDigest(session.refreshToken));
  assert.equal(jwt.verify(session.accessToken, { secret: 'a'.repeat(64) }).sub, registration.userId);
  assert.equal(jwt.verify(session.refreshToken, { secret: 'b'.repeat(64) }).sub, registration.userId);
});

test('pilot mode rejects public signup before creating an account', async () => {
  let called = false;
  const pilot = { enabled: true, assertRegistrationInvitation: async () => { called = true; }, registerInvited: async () => { called = true; } };
  const service = new AuthService({ user: { findUnique: async () => null } }, new JwtService(), config(), {}, pilot);
  await assert.rejects(service.register({ name: 'Оқушы', email: 'learner@example.invalid', password: 'Strong!!123' }),
    error => error instanceof ForbiddenException && error.getResponse().code === 'PILOT_INVITATION_REQUIRED');
  assert.equal(called, false);
});

test('pilot registration validates the invitation without disclosing whether an email already exists', async () => {
  for (const existing of [null, { id: 'existing-user' }]) {
    let userLookup = false;
    const pilot = {
      enabled: true,
      assertRegistrationInvitation: async () => {
        throw new ForbiddenException({ code: 'PILOT_INVITATION_INVALID', message: 'Шақыру жарамсыз немесе қолданылған' });
      },
      registerInvited: async () => {
        throw new ForbiddenException({ code: 'PILOT_INVITATION_INVALID', message: 'Шақыру жарамсыз немесе қолданылған' });
      },
    };
    const service = new AuthService({ user: { findUnique: async () => { userLookup = true; return existing; } } }, new JwtService(), config(), {}, pilot);
    await assert.rejects(
      service.register({ name: 'Оқушы', email: 'target@example.invalid', password: 'Strong!!123', invitationToken: 'x'.repeat(43) }),
      error => error instanceof ForbiddenException && error.getResponse().code === 'PILOT_INVITATION_INVALID',
    );
    assert.equal(userLookup, false);
  }
});

test('pilot admission reserves pending invitations and never exceeds the configured cohort cap', async () => {
  const db = pilotDb();
  db.state.users.push({ id: 'admin', email: 'owner@example.invalid' });
  const service = new PilotService(db, new PilotPolicy(config({ PILOT_MODE: 'true', PILOT_MAX_PARTICIPANTS: '2' })));
  await service.createInvitation('one@example.invalid', 24, 'admin');
  await service.createInvitation('two@example.invalid', 24, 'admin');
  await assert.rejects(service.createInvitation('three@example.invalid', 24, 'admin'), error => error instanceof ConflictException && error.getResponse().code === 'PILOT_COHORT_FULL');
});

test('revoked and expired invitations cannot create accounts', async () => {
  const db = pilotDb();
  db.state.users.push({ id: 'admin', email: 'owner@example.invalid' });
  const service = new PilotService(db, new PilotPolicy(config({ PILOT_MODE: 'true' })));
  const revoked = await service.createInvitation('revoked@example.invalid', 24, 'admin');
  await service.revokeInvitation(revoked.id, 'admin');
  await assert.rejects(service.registerInvited({
    userId: 'revoked-user', name: 'Revoked', email: revoked.email, phone: null, password: 'hash', invitationToken: revoked.activationToken, refreshTokenDigest: 'refresh',
  }), error => error instanceof ForbiddenException && error.getResponse().code === 'PILOT_INVITATION_INVALID');
  const expired = await service.createInvitation('expired@example.invalid', 24, 'admin');
  db.state.invitations.find(row => row.id === expired.id).expiresAt = new Date(Date.now() - 1);
  await assert.rejects(service.registerInvited({
    userId: 'expired-user', name: 'Expired', email: expired.email, phone: null, password: 'hash', invitationToken: expired.activationToken, refreshTokenDigest: 'refresh',
  }), error => error instanceof ForbiddenException && error.getResponse().code === 'PILOT_INVITATION_INVALID');
  assert.equal(db.state.users.length, 1);
});

test('suspension revokes sessions without deleting membership, enrollment, progress or certificate data', async () => {
  const db = pilotDb();
  db.state.users.push({ id: 'admin', email: 'owner@example.invalid', tokenVersion: 0 }, { id: 'student', email: 'student@example.invalid', tokenVersion: 4, refreshToken: 'digest', isOnline: true });
  db.state.memberships.push({ id: 'membership', userId: 'student', invitationId: 'invite', status: 'ACTIVE', suspendedAt: null, suspendedById: null, suspensionReason: null });
  db.enrollments = [{ userId: 'student' }]; db.progress = [{ userId: 'student' }]; db.certificates = [{ userId: 'student' }];
  const service = new PilotService(db, new PilotPolicy(config({ PILOT_MODE: 'true' })));
  await service.suspendMember('student', 'Owner requested pause', 'admin');
  assert.equal(db.state.memberships[0].status, 'SUSPENDED');
  assert.equal(db.state.users[1].tokenVersion, 5);
  assert.equal(db.state.users[1].refreshToken, null);
  assert.equal(db.enrollments.length + db.progress.length + db.certificates.length, 3);
  await assert.rejects(service.assertActiveStudent('student', 'STUDENT'), ForbiddenException);
  await service.resumeMember('student', 'admin');
  assert.equal(db.state.memberships[0].status, 'ACTIVE');
});

test('pilot enrollment is idempotent, enforces active membership and last-seat capacity, and withdrawal preserves the row', async () => {
  let membership = { status: 'ACTIVE' };
  let existing = null;
  let occupied = 0;
  const audits = [];
  const tx = {
    course: { findUnique: async () => ({ id: 'course', status: 'PUBLISHED' }) },
    pilotMembership: { findUnique: async () => membership },
    enrollment: {
      findUnique: async () => existing,
      count: async () => occupied,
      upsert: async ({ create, update }) => { existing = existing ? { ...existing, ...update } : { id: 'enrollment', ...create }; occupied = 1; return existing; },
      updateMany: async ({ where, data }) => {
        if (!existing || existing.id !== where.id || (where.completedAt === null && existing.completedAt) || existing.accessStatus !== 'ACTIVE') return { count: 0 };
        existing = { ...existing, ...data }; return { count: 1 };
      },
    },
    attempt: { findFirst: async () => null },
    auditEvent: { create: async ({ data }) => { audits.push(data); return data; } },
  };
  const db = { ...tx, $transaction: async (work, options) => { assert.equal(options.isolationLevel, 'Serializable'); return work(tx); } };
  const service = new EnrollmentsService(db, config({ PILOT_MODE: 'true', PILOT_DEFAULT_COURSE_SEATS: '1' }));
  await service.enroll('student', 'course');
  assert.equal((await service.enroll('student', 'course')).message, 'Курсқа тіркелгенсіз');
  await service.unenroll('student', 'course');
  assert.equal(existing.accessStatus, 'WITHDRAWN');
  assert.deepEqual(audits.map(row => [row.action, row.targetId, row.metadata.courseId]), [['PILOT_COURSE_WITHDRAWN', 'student', 'course']]);
  occupied = 1;
  await assert.rejects(service.enroll('student', 'course'), error => error.getResponse().code === 'COURSE_FULL');
  occupied = 0; membership = { status: 'SUSPENDED' };
  await assert.rejects(service.enroll('student', 'course'), error => error.getResponse().code === 'PILOT_ACCESS_DENIED');
});

test('pilot withdrawal blocks a live exam but staff can release expired or completed seats without deleting the row', async () => {
  let existing = { id: 'enrollment', userId: 'student', courseId: 'course', accessStatus: 'ACTIVE', completedAt: null };
  let attempt = { startedAt: new Date(), examSnapshot: { duration: 60 }, exam: { duration: 60 } };
  const audits = [];
  const tx = {
    enrollment: {
      findUnique: async () => existing,
      updateMany: async ({ where, data }) => {
        if (existing.id !== where.id || existing.accessStatus !== where.accessStatus || (where.completedAt === null && existing.completedAt)) return { count: 0 };
        existing = { ...existing, ...data }; return { count: 1 };
      },
    },
    attempt: { findFirst: async options => {
      assert.deepEqual(options.where.status, { in: ['IN_PROGRESS', 'FLAGGED'] });
      return attempt;
    } },
    auditEvent: { create: async ({ data }) => { audits.push(data); return data; } },
  };
  const db = { ...tx, $transaction: async work => work(tx) };
  const service = new EnrollmentsService(db, config({ PILOT_MODE: 'true' }));

  await assert.rejects(service.unenroll('student', 'course'), error => error instanceof ConflictException && error.getResponse().code === 'ACTIVE_EXAM_ATTEMPT');
  assert.equal(existing.accessStatus, 'ACTIVE');

  attempt = { startedAt: new Date(Date.now() - 120_000), examSnapshot: { duration: 1 }, exam: { duration: 1 } };
  await service.withdrawByStaff('admin', 'student', 'course');
  assert.equal(existing.accessStatus, 'WITHDRAWN');
  assert.equal(audits.at(-1).actorId, 'admin');

  existing = { ...existing, accessStatus: 'ACTIVE', withdrawnAt: null, completedAt: new Date() };
  attempt = null;
  await service.withdrawByStaff('admin', 'student', 'course');
  assert.equal(existing.accessStatus, 'WITHDRAWN');
  assert.ok(existing.completedAt);
});

test('JWT rejects a suspended pilot student while staff authentication stays independent', async () => {
  const cfg = config({ PILOT_MODE: 'true' });
  const db = {
    user: { findUnique: async () => ({ id: 'student', name: 'Student', email: 's@example.invalid', role: 'STUDENT', mustChangePassword: false, tokenVersion: 2 }), update: async () => ({}) },
    pilotMembership: { findUnique: async () => ({ status: 'SUSPENDED' }) },
  };
  await assert.rejects(new JwtStrategy(cfg, db).validate({ sub: 'student', email: 's@example.invalid', role: 'STUDENT', ver: 2 }), UnauthorizedException);
  db.user.findUnique = async () => ({ id: 'admin', name: 'Admin', email: 'a@example.invalid', role: 'ADMIN', mustChangePassword: false, tokenVersion: 2 });
  assert.equal((await new JwtStrategy(cfg, db).validate({ sub: 'admin', email: 'a@example.invalid', role: 'ADMIN', ver: 2 })).role, 'ADMIN');
});

test('pilot DTOs are bounded and every staff route requires JWT plus ADMIN role guard', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  await assert.rejects(pipe.transform({ email: 'not-email' }, { type: 'body', metatype: CreatePilotInvitationDto }), BadRequestException);
  await assert.rejects(pipe.transform({ reason: '  ' }, { type: 'body', metatype: SuspendPilotMemberDto }), BadRequestException);
  const guards = Reflect.getMetadata(GUARDS_METADATA, PilotController);
  assert.ok(guards.includes(JwtAuthGuard));
  assert.ok(guards.includes(RolesGuard));
  for (const route of ['createInvitation', 'revokeInvitation', 'overview', 'progress', 'suspend', 'resume', 'withdrawCourse']) {
    const headers = Reflect.getMetadata(HEADERS_METADATA, PilotController.prototype[route]);
    assert.ok(headers.some(header => header.name === 'Cache-Control' && header.value === 'no-store'), `${route} must disable caching`);
    assert.ok(headers.some(header => header.name === 'Referrer-Policy' && header.value === 'no-referrer'), `${route} must suppress referrers`);
  }
});
