const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { CertificatesService } = require('../src/certificates/certificates.service');

test('public verification selects and returns only the details printed on a certificate', async () => {
  let query;
  const issuedAt = new Date('2026-09-20T12:00:00Z');
  const cert = {
    id: 'private-certificate-id', userId: 'private-user-id', courseId: 'private-course-id', qrCode: 'public-code',
    issuedAt, issuedVia: 'PROCTORED_EXAM', status: 'VALID',
    user: { name: 'Әсел Қанат', id: 'private-user-id', email: 'private@example.invalid', phone: 'private-phone', password: 'private-hash' },
    course: { id: 'private-course-id', title: 'Қазақ тілі', teacherId: 'private-teacher-id' },
    evidence: [{ url: 'private-recording-key' }], reviewReason: 'private-review-reason',
  };
  const service = new CertificatesService({ certificate: { findUnique: async (value) => { query = value; return cert; } } });
  const result = await service.verify('public-code');
  assert.deepEqual(query, { where: { qrCode: 'public-code' }, select: {
    status: true, issuedAt: true, issuedVia: true, user: { select: { name: true } }, course: { select: { title: true } },
  } });
  assert.deepEqual(result, { valid: true, certificate: {
    recipientName: 'Әсел Қанат', courseTitle: 'Қазақ тілі', issuedAt, issuedVia: 'PROCTORED_EXAM',
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
      issuedAt: new Date(0), issuedVia, status: 'VALID', user: { name: 'Holder' }, course: { title: 'Course' },
    }) } });
    const result = await service.verify('code');
    assert.equal(result.valid, true);
    assert.equal(result.certificate.issuedVia, issuedVia);
    assert.deepEqual(Object.keys(result.certificate).sort(), ['courseTitle', 'issuedAt', 'issuedVia', 'recipientName']);
  }
});

test('revoked public code is not valid', async () => {
  const service = new CertificatesService({ certificate: { findUnique: async () => ({ status: 'REVOKED' }) } });
  assert.deepEqual(await service.verify('revoked'), { valid: false, status: 'REVOKED' });
});
