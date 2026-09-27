const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { BadRequestException, ConflictException, ForbiddenException, ValidationPipe } = require('@nestjs/common');
const { Test } = require('@nestjs/testing');
const { ProctorService } = require('../src/proctor/proctor.service');
const { ProctorController } = require('../src/proctor/proctor.controller');
const { CertificatesService } = require('../src/certificates/certificates.service');
const { PrismaService } = require('../src/prisma/prisma.service');
const { JwtAuthGuard } = require('../src/common/guards/jwt-auth.guard');

const reviewer = { id: 'proctor', role: 'PROCTOR' };
const approval = { decision: 'APPROVED', reason: 'Both recordings reviewed' };
const rejection = { decision: 'REJECTED', reason: 'Screen evidence is incomplete' };

function fixture() {
  let state = {
    attempt: {
      id: 'attempt', examId: 'exam', userId: 'student', status: 'FINISHED', score: 75, trustScore: 100,
      startedAt: new Date(), finishedAt: new Date(), reviewStatus: 'PENDING', reviewedBy: null,
      reviewedAt: null, reviewReason: null, flaggedAt: null,
      examSnapshot: { id: 'exam', courseId: 'course', title: 'Original exam', duration: 30, passScore: 70,
        questions: [{ id: 'question', text: 'Q', type: 'TEXT', options: null, answer: 'private answer' }] },
      draftAnswers: [{ questionId: 'question', answer: 'private draft' }], submissionDigest: 'private digest',
    },
    evidence: [
      { type: 'recording_camera', url: 'recordings/attempt/camera.webm' },
      { type: 'recording_screen', url: 'recordings/attempt/screen.webm' },
    ],
    certificates: [], events: [], enrollment: { userId: 'student', courseId: 'course', completedAt: null },
    assigned: true,
  };
  const failures = { certificate: false, enrollment: false, cas: false };
  const db = {
    attempt: {
      findUnique: async ({ where }) => where.id === 'attempt' ? structuredClone({
        ...state.attempt, events: state.events, evidences: state.evidence,
        exam: { id: 'exam', title: 'Changed exam', duration: 1, passScore: 1, courseId: 'course' },
        user: { id: 'student', name: 'Student', email: 'student@example.invalid' },
      }) : null,
      updateMany: async ({ where, data }) => {
        if (failures.cas || state.attempt.reviewStatus !== where.reviewStatus) return { count: 0 };
        Object.assign(state.attempt, data);
        return { count: 1 };
      },
      update: async ({ data }) => Object.assign(state.attempt, data),
    },
    examProctor: { findUnique: async ({ where }) => state.assigned && where.examId_proctorId.proctorId === 'proctor' ? { examId: 'exam', proctorId: 'proctor' } : null },
    evidenceFile: { findMany: async () => structuredClone(state.evidence) },
    certificate: {
      findFirst: async ({ where }) => state.certificates.find((certificate) => certificate.userId === where.userId && certificate.courseId === where.courseId) || null,
      create: async ({ data }) => {
        if (failures.certificate) throw new Error('Certificate storage failed');
        const certificate = { id: 'certificate', ...data, issuedAt: new Date() };
        state.certificates.push(certificate);
        return certificate;
      },
    },
    enrollment: { updateMany: async ({ data }) => {
      if (failures.enrollment) throw new Error('Enrollment storage failed');
      Object.assign(state.enrollment, data); return { count: 1 };
    } },
    proctorEvent: { create: async ({ data }) => { const event = { id: 'event', ...data }; state.events.push(event); return event; } },
    $transaction: async (work, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      const before = structuredClone(state);
      try { return await work(db); } catch (error) { state = before; throw error; }
    },
  };
  const certificates = new CertificatesService(db);
  const service = new ProctorService(db, certificates);
  return { db, certificates, service, failures, get state() { return state; } };
}

test('passing submission alone cannot issue a certificate before review', async () => {
  const f = fixture();
  await assert.rejects(f.certificates.issueForAttempt('attempt'), ConflictException);
  assert.equal(f.state.certificates.length, 0);
  assert.equal(f.state.enrollment.completedAt, null);
});

test('approval commits review, provenance, certificate and course completion together', async () => {
  const f = fixture();
  const result = await f.service.reviewAttempt('attempt', reviewer, approval);
  assert.equal(result.status, 'FINISHED');
  assert.equal(result.reviewStatus, 'APPROVED');
  assert.equal(result.certificateIssued, true);
  assert.equal(result.certificatePending, false);
  assert.equal(result.certificateId, 'certificate');
  assert.equal(f.state.attempt.reviewedBy, 'proctor');
  assert.equal(f.state.attempt.reviewReason, approval.reason);
  assert.ok(f.state.attempt.reviewedAt instanceof Date);
  assert.equal(f.state.certificates[0].issuedVia, 'PROCTORED_EXAM');
  assert.ok(f.state.enrollment.completedAt instanceof Date);
});

test('review requires current assignment or admin role and rejects self review', async () => {
  const f = fixture();
  for (const actor of [{ id: 'outsider', role: 'PROCTOR' }, { id: 'teacher', role: 'TEACHER' }, { id: 'student', role: 'ADMIN' }]) {
    await assert.rejects(f.service.reviewAttempt('attempt', actor, approval), ForbiddenException);
  }
  f.state.assigned = false;
  await assert.rejects(f.service.reviewAttempt('attempt', reviewer, approval), ForbiddenException);
  assert.equal(f.state.attempt.reviewStatus, 'PENDING');
  const result = await f.service.reviewAttempt('attempt', { id: 'admin', role: 'ADMIN' }, approval);
  assert.equal(result.reviewStatus, 'APPROVED');
});

test('only ended attempts can receive either review decision', async () => {
  for (const decision of [approval, rejection]) for (const patch of [{ status: 'IN_PROGRESS' }, { finishedAt: null }, { status: 'FLAGGED' }]) {
    const f = fixture();
    Object.assign(f.state.attempt, patch);
    await assert.rejects(f.service.reviewAttempt('attempt', reviewer, decision), ConflictException);
    assert.equal(f.state.attempt.reviewStatus, 'PENDING');
  }
});

test('approval uses the frozen pass score, rejects failed grades and requires a valid snapshot', async () => {
  for (const patch of [{ score: 69 }, { status: 'FAILED' }, { score: null }, { examSnapshot: null }, { examSnapshot: { courseId: 'course', passScore: 101 } }]) {
    const f = fixture();
    Object.assign(f.state.attempt, patch);
    await assert.rejects(f.service.reviewAttempt('attempt', reviewer, approval), ConflictException);
    assert.equal(f.state.attempt.reviewStatus, 'PENDING');
    assert.equal(f.state.certificates.length, 0);
  }
});

test('approval requires both completed evidence types, not duplicates or empty objects', async () => {
  for (const evidence of [[], [{ type: 'recording_camera', url: 'camera' }], [{ type: 'recording_screen', url: 'screen' }],
    [{ type: 'recording_camera', url: 'one' }, { type: 'recording_camera', url: 'two' }],
    [{ type: 'recording_camera', url: 'camera' }, { type: 'recording_screen', url: '' }]]) {
    const f = fixture();
    f.state.evidence = evidence;
    await assert.rejects(f.service.reviewAttempt('attempt', reviewer, approval), ConflictException);
    assert.equal(f.state.attempt.reviewStatus, 'PENDING');
    assert.equal(f.state.attempt.reviewedAt, null);
    assert.equal(f.state.certificates.length, 0);
  }
});

test('rejection records a reason without requiring evidence or issuing a certificate', async () => {
  const f = fixture();
  f.state.evidence = [];
  f.state.attempt.status = 'FAILED';
  f.state.attempt.score = 20;
  const result = await f.service.reviewAttempt('attempt', reviewer, rejection);
  assert.equal(result.reviewStatus, 'REJECTED');
  assert.equal(result.certificateIssued, false);
  assert.equal(result.certificatePending, false);
  assert.equal(f.state.certificates.length, 0);
  assert.equal(f.state.enrollment.completedAt, null);
});

test('same decision and normalized reason are idempotent, conflicting retries are rejected', async () => {
  for (const decision of [approval, rejection]) {
    const f = fixture();
    const first = await f.service.reviewAttempt('attempt', reviewer, decision);
    const second = await f.service.reviewAttempt('attempt', reviewer, { ...decision, reason: `  ${decision.reason}  ` });
    assert.deepEqual(second, first);
    assert.equal(f.state.certificates.length, decision.decision === 'APPROVED' ? 1 : 0);
    await assert.rejects(f.service.reviewAttempt('attempt', reviewer, { ...decision, reason: 'Changed audit reason' }), ConflictException);
    await assert.rejects(f.service.reviewAttempt('attempt', reviewer, decision === approval ? rejection : approval), ConflictException);
  }
});

test('storage failures and a lost compare-and-set roll back the whole review', async () => {
  for (const failure of ['certificate', 'enrollment', 'cas']) {
    const f = fixture();
    f.failures[failure] = true;
    await assert.rejects(f.service.reviewAttempt('attempt', reviewer, approval), failure === 'cas' ? ConflictException : /storage failed/);
    assert.equal(f.state.attempt.reviewStatus, 'PENDING');
    assert.equal(f.state.attempt.reviewedAt, null);
    assert.equal(f.state.certificates.length, 0);
    assert.equal(f.state.enrollment.completedAt, null);
  }
});

test('legacy certificates are preserved during approval, rejection and manual grants', async () => {
  for (const decision of [approval, rejection]) {
    const f = fixture();
    const legacy = { id: 'legacy', userId: 'student', courseId: 'course', issuedVia: 'LEGACY', qrCode: 'existing-code' };
    f.state.certificates.push({ ...legacy });
    await f.service.reviewAttempt('attempt', reviewer, decision);
    assert.deepEqual(f.state.certificates, [legacy]);
  }
  const f = fixture();
  const cert = await f.certificates.issue('student', 'course', f.db, 'ADMIN_OVERRIDE');
  assert.equal(cert.issuedVia, 'ADMIN_OVERRIDE');
});

test('zero trust flags for review while allowing the student to finish the attempt', async () => {
  const f = fixture();
  Object.assign(f.state.attempt, { status: 'IN_PROGRESS', finishedAt: null, trustScore: 10,
    startedAt: new Date(Date.now() - 5 * 60_000) });
  // Live exam duration is only one minute; the frozen 30-minute duration governs.
  const result = await f.service.recordEvent('attempt', 'student', 'tab_switch');
  assert.equal(result.trustScore, 0);
  assert.equal(f.state.attempt.status, 'IN_PROGRESS');
  assert.ok(f.state.attempt.flaggedAt instanceof Date);
  const flaggedAt = f.state.attempt.flaggedAt;
  await f.service.recordEvent('attempt', 'student', 'fullscreen_exit');
  assert.equal(f.state.attempt.flaggedAt, flaggedAt);
});

test('proctor summaries never expose the frozen answer key, drafts or submission digest', async () => {
  const f = fixture();
  const result = await f.service.getSessionSummary('attempt', reviewer);
  assert.equal(result.exam.title, 'Original exam');
  assert.ok(Array.isArray(result.events));
  assert.ok(Array.isArray(result.evidences));
  const json = JSON.stringify(result);
  for (const secret of ['private answer', 'private draft', 'private digest', 'examSnapshot', 'draftAnswers', 'submissionDigest']) assert.equal(json.includes(secret), false, secret);
});

test('HTTP review validation rejects invalid decisions, blank/long reasons and extra fields', async () => {
  const f = fixture();
  const module = await Test.createTestingModule({
    controllers: [ProctorController], providers: [ProctorService, CertificatesService, { provide: PrismaService, useValue: f.db }],
  }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (context) => {
    context.switchToHttp().getRequest().user = reviewer; return true;
  } }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  try {
    await app.listen(0, '127.0.0.1');
    const url = `${await app.getUrl()}/proctor/sessions/attempt/review`;
    for (const body of [{ ...approval, decision: 'PENDING' }, { ...approval, reason: '  ' }, { ...approval, reason: 'x'.repeat(2001) }, { ...approval, reason: {} }, { ...approval, reviewedBy: 'admin' }]) {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 400);
    }
    assert.equal(f.state.attempt.reviewStatus, 'PENDING');
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(approval) });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).certificateIssued, true);
  } finally { await app.close(); }
});
