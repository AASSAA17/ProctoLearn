const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { ProctorService } = require('../src/proctor/proctor.service');
const { ProctorController } = require('../src/proctor/proctor.controller');
const { CertificatesService } = require('../src/certificates/certificates.service');
const { PrismaService } = require('../src/prisma/prisma.service');
const { JwtAuthGuard } = require('../src/common/guards/jwt-auth.guard');
const owner = { id: 'student', role: 'STUDENT' };
const original = { id: 'original', role: 'PROCTOR' };
const reviewer = { id: 'independent', role: 'PROCTOR' };
const reason = { reason: 'Please inspect the recovered screen recording' };
const overturn = { decision: 'OVERTURNED', reason: 'Complete recordings support approval' };
const uphold = { decision: 'UPHELD', reason: 'Evidence confirms the initial rejection' };
const status = (code) => (error) => error.getStatus?.() === code;

function fixture() {
  let state = {
    attempt: { id: 'attempt', examId: 'exam', userId: 'student', status: 'FINISHED', score: 80,
      finishedAt: new Date(), reviewStatus: 'REJECTED', reviewedAt: new Date(), reviewedBy: 'original', reviewReason: 'Missing screen',
      examSnapshot: { id: 'exam', courseId: 'course', passScore: 70 }, draftAnswers: ['secret'], submissionDigest: 'secret' },
    reviews: [{ id: 'initial', attemptId: 'attempt', reviewerId: 'original', decision: 'REJECTED', reason: 'Missing screen', source: 'INITIAL', createdAt: new Date() }],
    appeal: null, certificates: [], uploads: [], notifications: [],
    evidence: [{ id: 'camera', type: 'recording_camera', url: 'camera.webm' }, { id: 'screen', type: 'recording_screen', url: 'screen.webm' }],
    enrollment: { completedAt: null }, assigned: ['original', 'independent'],
  };
  const failures = { certificate: false, enrollment: false, history: false, cas: false };
  const db = {
    userNotification: { createMany: async ({ data }) => { for (const item of data) if (!state.notifications.some(n => n.dedupeKey === item.dedupeKey)) state.notifications.push(item); return { count: data.length }; } },
    attempt: {
      findUnique: async ({ where }) => where.id === 'attempt' ? structuredClone(state.attempt) : null,
      updateMany: async ({ where, data }) => {
        if (state.attempt.reviewStatus !== where.reviewStatus) return { count: 0 };
        Object.assign(state.attempt, data); return { count: 1 };
      },
    },
    examProctor: { findUnique: async ({ where }) => state.assigned.includes(where.examId_proctorId.proctorId) ? { examId: 'exam' } : null },
    attemptAppeal: {
      findUnique: async () => structuredClone(state.appeal),
      create: async ({ data }) => { assert.equal(state.appeal, null); state.appeal = { id: 'appeal', state: 'OPEN', createdAt: new Date(), decidedAt: null, decidedBy: null, response: null, ...data }; return structuredClone(state.appeal); },
      updateMany: async ({ where, data }) => {
        if (failures.cas || !state.appeal || state.appeal.id !== where.id || state.appeal.state !== where.state) return { count: 0 };
        Object.assign(state.appeal, data); return { count: 1 };
      },
    },
    attemptReview: {
      findMany: async () => structuredClone(state.reviews),
      findFirst: async ({ where }) => structuredClone(state.reviews.find((review) => review.source === where.source) ?? null),
      create: async ({ data }) => {
        if (failures.history) throw new Error('History storage failed');
        const review = { id: `review-${state.reviews.length}`, createdAt: new Date(), ...data }; state.reviews.push(review); return review;
      },
    },
    evidenceFile: { findMany: async () => structuredClone(state.evidence) },
    recordingUpload: {
      findMany: async () => structuredClone(state.uploads),
      updateMany: async ({ where, data }) => {
        const matching = state.uploads.filter((upload) => where.state.in.includes(upload.state) && upload.expiresAt < where.expiresAt.lt);
        matching.forEach((upload) => Object.assign(upload, data)); return { count: matching.length };
      },
    },
    certificate: {
      findFirst: async ({ where }) => structuredClone(state.certificates.find((certificate) => certificate.userId === where.userId && certificate.courseId === where.courseId) ?? null),
      create: async ({ data }) => { if (failures.certificate) throw new Error('Certificate storage failed'); const certificate = { id: 'certificate', ...data }; state.certificates.push(certificate); return certificate; },
    },
    enrollment: { updateMany: async ({ data }) => { if (failures.enrollment) throw new Error('Enrollment storage failed'); Object.assign(state.enrollment, data); return { count: 1 }; } },
    $transaction: async (work, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      const before = structuredClone(state);
      try { return await work(db); } catch (error) { state = before; throw error; }
    },
  };
  return { db, failures, service: new ProctorService(db, new CertificatesService(db)), get state() { return state; } };
}

test('only the owner of a finished rejected attempt can create exactly one appeal', async () => {
  const f = fixture();
  for (const actor of [reviewer, original, { id: 'admin', role: 'ADMIN' }, { id: 'other', role: 'STUDENT' }]) await assert.rejects(f.service.createAppeal('attempt', actor, reason), status(403));
  for (const patch of [{ reviewStatus: 'PENDING' }, { reviewStatus: 'APPROVED' }, { finishedAt: null }, { status: 'IN_PROGRESS' }]) {
    const invalid = fixture(); Object.assign(invalid.state.attempt, patch);
    await assert.rejects(invalid.service.createAppeal('attempt', owner, reason), status(409));
    assert.equal(invalid.state.appeal, null);
  }
  const first = await f.service.createAppeal('attempt', owner, reason);
  assert.deepEqual(await f.service.createAppeal('attempt', owner, { reason: ` ${reason.reason} ` }), first);
  await assert.rejects(f.service.createAppeal('attempt', owner, { reason: 'Replacement reason' }), status(409));
});

test('appeal and history reads enforce ownership or assigned proctor/admin access', async () => {
  const f = fixture(); await f.service.createAppeal('attempt', owner, reason);
  for (const actor of [owner, reviewer, { id: 'admin', role: 'ADMIN' }]) {
    const result = await f.service.getAppeal('attempt', actor);
    assert.equal(result.appeal.reason, reason.reason); assert.equal(result.history.length, 1);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
  for (const actor of [{ id: 'other', role: 'STUDENT' }, { id: 'teacher', role: 'TEACHER' }, { id: 'other', role: 'PROCTOR' }]) await assert.rejects(f.service.getAppeal('attempt', actor), status(403));
  f.state.assigned = [];
  await assert.rejects(f.service.getAppeal('attempt', reviewer), status(403));
});

test('original reviewer, owner even as admin, and unassigned reviewer cannot resolve an appeal', async () => {
  const f = fixture(); await f.service.createAppeal('attempt', owner, reason);
  for (const actor of [original, { ...original, role: 'ADMIN' }, { ...owner, role: 'ADMIN' }, { id: 'other', role: 'PROCTOR' }, { id: 'teacher', role: 'TEACHER' }]) {
    await assert.rejects(f.service.resolveAppeal('attempt', actor, overturn), status(403));
  }
  f.state.assigned = ['original'];
  await assert.rejects(f.service.resolveAppeal('attempt', reviewer, overturn), status(403));
  assert.equal(f.state.appeal.state, 'OPEN'); assert.equal(f.state.reviews.length, 1);
});

test('overturn atomically issues a certificate and preserves original audit on idempotent retries', async () => {
  const f = fixture(); await f.service.createAppeal('attempt', owner, reason);
  const initial = structuredClone(f.state.reviews[0]);
  const first = await f.service.resolveAppeal('attempt', reviewer, overturn);
  assert.equal(first.reviewStatus, 'APPROVED'); assert.equal(first.certificateIssued, true);
  assert.equal(first.appeal.state, 'OVERTURNED'); assert.equal(first.appeal.decidedBy, reviewer.id);
  assert.deepEqual(await f.service.resolveAppeal('attempt', reviewer, overturn), first);
  assert.equal(f.state.attempt.reviewedBy, reviewer.id); assert.ok(f.state.enrollment.completedAt);
  assert.equal(f.state.certificates.length, 1); assert.equal(f.state.certificates[0].issuedVia, 'PROCTORED_EXAM');
  assert.deepEqual(f.state.reviews[0], initial); assert.equal(f.state.reviews.length, 2);
  assert.equal(f.state.reviews[1].source, 'APPEAL'); assert.equal(f.state.reviews[1].decision, 'OVERTURNED');
  await assert.rejects(f.service.resolveAppeal('attempt', reviewer, uphold), status(409));
  await assert.rejects(f.service.resolveAppeal('attempt', reviewer, { ...overturn, reason: 'Changed reason' }), status(409));
  assert.equal((await f.service.createAppeal('attempt', owner, reason)).state, 'OVERTURNED');
  await assert.rejects(f.service.createAppeal('attempt', owner, { reason: 'Second appeal' }), status(409));
});

test('upheld rejection requires no evidence and never issues or revokes certificates', async () => {
  const f = fixture(); f.state.evidence = []; f.state.certificates.push({ id: 'legacy', userId: 'student', courseId: 'course', issuedVia: 'LEGACY' });
  await f.service.createAppeal('attempt', owner, reason);
  const first = await f.service.resolveAppeal('attempt', reviewer, uphold);
  assert.equal(first.reviewStatus, 'REJECTED'); assert.equal(first.certificateIssued, false);
  assert.equal(f.state.attempt.reviewedBy, original.id); assert.equal(f.state.enrollment.completedAt, null);
  assert.equal(f.state.certificates.length, 1); assert.equal(f.state.certificates[0].issuedVia, 'LEGACY');
  assert.deepEqual(await f.service.resolveAppeal('attempt', reviewer, uphold), first);
  assert.equal(f.state.reviews.length, 2);
});

test('overturn still requires frozen pass threshold and both complete recordings', async () => {
  for (const patch of [{ score: 69 }, { status: 'FAILED' }, { examSnapshot: null }]) {
    const f = fixture(); Object.assign(f.state.attempt, patch); await f.service.createAppeal('attempt', owner, reason);
    await assert.rejects(f.service.resolveAppeal('attempt', reviewer, overturn), status(409));
    assert.equal(f.state.appeal.state, 'OPEN'); assert.equal(f.state.attempt.reviewStatus, 'REJECTED'); assert.equal(f.state.reviews.length, 1);
  }
  const f = fixture(); f.state.evidence.pop(); await f.service.createAppeal('attempt', owner, reason);
  await assert.rejects(f.service.resolveAppeal('attempt', reviewer, overturn), status(409));
  assert.equal(f.state.appeal.state, 'OPEN'); assert.equal(f.state.certificates.length, 0);
});

test('incomplete uploads and mismatched complete manifests block certificates; aborted fragments remain reviewable', async () => {
  for (const upload of [{ state: 'OPEN' }, { state: 'FINALIZING' }, { state: 'UNKNOWN' }, { state: 'COMPLETE', evidenceId: null }, { state: 'COMPLETE', evidenceId: 'screen' }]) {
    const f = fixture(); f.state.uploads = [{ kind: 'camera', ...upload }]; await f.service.createAppeal('attempt', owner, reason);
    await assert.rejects(f.service.resolveAppeal('attempt', reviewer, overturn), status(409));
    assert.equal(f.state.appeal.state, 'OPEN'); assert.equal(f.state.certificates.length, 0);
  }
  const f = fixture(); f.state.uploads = [{ kind: 'camera', state: 'ABORTED', evidenceId: null }, { kind: 'camera', state: 'COMPLETE', evidenceId: 'camera', interrupted: true }, { kind: 'screen', state: 'COMPLETE', evidenceId: 'screen' }];
  await f.service.createAppeal('attempt', owner, reason);
  assert.equal((await f.service.resolveAppeal('attempt', reviewer, overturn)).certificateIssued, true);
});

test('certificate, enrollment, audit and CAS failures roll back the appeal transaction', async () => {
  for (const failure of ['certificate', 'enrollment', 'history', 'cas']) {
    const f = fixture(); await f.service.createAppeal('attempt', owner, reason); f.failures[failure] = true;
    await assert.rejects(f.service.resolveAppeal('attempt', reviewer, overturn), failure === 'cas' ? status(409) : /storage failed/);
    assert.equal(f.state.appeal.state, 'OPEN'); assert.equal(f.state.appeal.decidedBy, null);
    assert.equal(f.state.attempt.reviewStatus, 'REJECTED'); assert.equal(f.state.attempt.reviewedBy, original.id);
    assert.equal(f.state.certificates.length, 0); assert.equal(f.state.enrollment.completedAt, null); assert.equal(f.state.reviews.length, 1);
  }
});

test('legacy review audit is preserved before the reviewer field changes', async () => {
  const f = fixture(); f.state.reviews = []; await f.service.createAppeal('attempt', owner, reason);
  const first = await f.service.resolveAppeal('attempt', reviewer, overturn);
  assert.equal(f.state.reviews[0].reviewerId, original.id); assert.equal(f.state.reviews[0].source, 'INITIAL');
  assert.deepEqual(await f.service.resolveAppeal('attempt', reviewer, overturn), first);
  await assert.rejects(f.service.resolveAppeal('attempt', original, overturn), status(403));
});

test('Nest HTTP appeal routes enforce validation, owner access and independent review', async () => {
  const f = fixture(); let actor = owner;
  const module = await Test.createTestingModule({ controllers: [ProctorController], providers: [ProctorService, CertificatesService, { provide: PrismaService, useValue: f.db }] })
    .overrideGuard(JwtAuthGuard).useValue({ canActivate(context) { context.switchToHttp().getRequest().user = actor; return true; } }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  try {
    await app.listen(0, '127.0.0.1'); const base = `${await app.getUrl()}/proctor/sessions/attempt/appeal`;
    const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    for (const body of [{ reason: '  ' }, { reason: 1 }, { reason: 'x'.repeat(2001) }, { ...reason, state: 'OVERTURNED' }]) assert.equal((await post(base, body)).status, 400);
    assert.equal((await post(base, reason)).status, 201);
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await post(`${base}/resolve`, overturn)).status, 403);
    actor = original; assert.equal((await post(`${base}/resolve`, overturn)).status, 403);
    actor = reviewer;
    for (const body of [{ ...overturn, decision: 'APPROVED' }, { ...overturn, reason: '' }, { ...overturn, decidedBy: 'admin' }]) assert.equal((await post(`${base}/resolve`, body)).status, 400);
    const response = await post(`${base}/resolve`, overturn); assert.equal(response.status, 201); assert.equal((await response.json()).certificateIssued, true);
    actor = { id: 'outsider', role: 'PROCTOR' }; assert.equal((await fetch(base)).status, 403);
  } finally { await app.close(); }
});
