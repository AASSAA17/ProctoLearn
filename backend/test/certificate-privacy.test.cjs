const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { CertificatesService } = require('../src/certificates/certificates.service');

test('public verification selects and returns only the details printed on a certificate', async () => {
  let query;
  const issuedAt = new Date('2026-09-20T12:00:00Z');
  const cert = {
    id: 'private-certificate-id', userId: 'private-user-id', courseId: 'private-course-id', qrCode: 'public-code',
    issuedAt, issuedVia: 'PROCTORED_EXAM', status: 'VALID', recipientName: 'Әсел Қанат', courseTitle: 'Қазақ тілі', issuerName: 'ProctoLearn', snapshotStatus: 'CAPTURED',
    user: { name: 'Әсел Қанат', id: 'private-user-id', email: 'private@example.invalid', phone: 'private-phone', password: 'private-hash' },
    course: { id: 'private-course-id', title: 'Қазақ тілі', teacherId: 'private-teacher-id' },
    evidence: [{ url: 'private-recording-key' }], reviewReason: 'private-review-reason',
  };
  const service = new CertificatesService({ certificate: { findUnique: async (value) => { query = value; return cert; } } });
  const result = await service.verify('public-code');
  assert.deepEqual(query, { where: { qrCode: 'public-code' }, select: {
    status: true, issuedAt: true, issuedVia: true, recipientName: true, courseTitle: true, issuerName: true, snapshotStatus: true,
  } });
  assert.deepEqual(result, { valid: true, certificate: {
    recipientName: 'Әсел Қанат', courseTitle: 'Қазақ тілі', issuerName: 'ProctoLearn', snapshotStatus: 'CAPTURED', issuedAt, issuedVia: 'PROCTORED_EXAM',
  } });
  assert.doesNotMatch(JSON.stringify(result), /private-|@example|public-code/);
});

test('unknown public code returns only valid false', async () => {
  const service = new CertificatesService({ certificate: { findUnique: async () => null } });
  assert.deepEqual(await service.verify('unknown'), { valid: false });
});

test('legacy and administrator issuance remain distinguishable without exposing ownership or evidence', async () => {
  for (const issuedVia of ['LEGACY', 'ADMIN_OVERRIDE']) {
    const service = new CertificatesService({ certificate: { findUnique: async () => ({
      issuedAt: new Date(0), issuedVia, status: 'VALID', recipientName: null, courseTitle: null, issuerName: null, snapshotStatus: 'LEGACY_UNAVAILABLE',
    }) } });
    const result = await service.verify('code');
    assert.equal(result.valid, true);
    assert.equal(result.certificate.issuedVia, issuedVia);
    assert.deepEqual(Object.keys(result.certificate).sort(), ['courseTitle', 'issuedAt', 'issuedVia', 'issuerName', 'recipientName', 'snapshotStatus']);
  }
});

test('revoked public code is not valid', async () => {
  const service = new CertificatesService({ certificate: { findUnique: async () => ({ status: 'REVOKED' }) } });
  assert.deepEqual(await service.verify('revoked'), { valid: false, status: 'REVOKED' });
});

test('certificate origin is singular and rejects untrusted URL parts independently of CORS', () => {
  const { certificateOrigin } = require('../src/common/config/certificate-origin');
  assert.equal(certificateOrigin('https://verify.example.invalid/', true), 'https://verify.example.invalid');
  assert.equal(certificateOrigin('http://localhost:3000', false), 'http://localhost:3000');
  for (const value of ['', 'https://a.test,https://b.test', 'https://a.test/path', 'https://a.test?q=1', 'https://x:y@a.test', 'http://verify.example.invalid']) {
    assert.throws(() => certificateOrigin(value, true), /CERTIFICATE_PUBLIC_ORIGIN/);
  }
});

test('revocation rejects non-string reasons before database mutation', async () => {
  const service = new CertificatesService({});
  for (const reason of [null, {}, [], 7, '', ' ', 'x'.repeat(501)]) {
    await assert.rejects(service.revoke('certificate', 'admin', reason), error => error.getStatus() === 409);
  }
});

test('certificate administrator list/revoke routes deny other roles before service access', async () => {
  const { Test } = require('@nestjs/testing');
  const { AdminController } = require('../src/admin/admin.controller');
  const { AdminService } = require('../src/admin/admin.service');
  const { JwtAuthGuard } = require('../src/common/guards/jwt-auth.guard');
  const calls = [];
  const module = await Test.createTestingModule({ controllers: [AdminController], providers: [{ provide: AdminService, useValue: {
    getUserCertificates: async id => { calls.push(['list', id]); return []; },
    revokeCertificate: async (id, actor, reason) => { calls.push(['revoke', id, actor, reason]); return { ok: true }; },
  } }] }).overrideGuard(JwtAuthGuard).useValue({ canActivate(ctx) {
    const req = ctx.switchToHttp().getRequest(); if (!req.headers['x-test-role']) return false;
    req.user = { id: 'admin-fixture', role: req.headers['x-test-role'] }; return true;
  } }).compile();
  const app = module.createNestApplication({ logger: false });
  try {
    await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
    for (const role of [null, 'STUDENT', 'TEACHER', 'PROCTOR', 'ADMIN']) {
      const headers = { 'Content-Type': 'application/json', ...(role ? { 'X-Test-Role': role } : {}) };
      assert.equal((await fetch(base + '/admin/users/student/certificates', { headers })).status, role === 'ADMIN' ? 200 : 403);
      assert.equal((await fetch(base + '/admin/certificates/cert/revoke', { method: 'POST', headers, body: JSON.stringify({ reason: 'Fixture' }) })).status, role === 'ADMIN' ? 201 : 403);
    }
    assert.deepEqual(calls, [['list', 'student'], ['revoke', 'cert', 'admin-fixture', 'Fixture']]);
  } finally { await app.close(); }
});
