const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(name) {
  const filename = path.resolve(__dirname, `../src/lib/${name}.ts`);
  const compiled = new Module(filename, module);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return compiled.exports;
}
const { certificateVerificationUrl, notificationTarget } = load('public-links');
const {
  fetchPublicCertificateVerification,
  isCertificateVerificationCode,
  publicCertificateVerification,
} = load('public-certificate-verification');
const { finishExpiredConflict, isClosedExamError } = load('exam-expiry');
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
const closed = (code) => ({ response: { data: { code } } });

test('certificate QR links to the public frontend route and safely encodes the code', () => {
  assert.equal(certificateVerificationUrl('https://learn.example/dashboard', 'a/b ?#'), 'https://learn.example/verify/a%2Fb%20%3F%23');
  assert.equal(certificateVerificationUrl('http://localhost:3000', 'code'), 'http://localhost:3000/verify/code');
  assert.throws(() => certificateVerificationUrl('javascript:alert(1)', 'code'));
});

test('notification links reject external origins, scripts and browser-normalized backslashes', () => {
  for (const value of [null, '', 'https://evil.invalid', '//evil.invalid/path', '/\\evil.invalid', '\\evil.invalid', 'javascript:alert(1)', '/\n/evil.invalid']) {
    assert.equal(notificationTarget(value), null, String(value));
  }
  assert.equal(notificationTarget('/dashboard/my-attempts/id?from=inbox#review'), '/dashboard/my-attempts/id?from=inbox#review');
});

test('public certificate bridge accepts only UUID certificate codes', () => {
  assert.equal(isCertificateVerificationCode('d9428888-122b-4d5f-9a8b-9f7419b8451c'), true);
  for (const code of ['', 'not-a-uuid', '../auth/me', '00000000-0000-0000-0000-000000000000', 'd9428888-122b-0d5f-9a8b-9f7419b8451c']) {
    assert.equal(isCertificateVerificationCode(code), false, code);
  }
});

test('public certificate bridge uses the fixed loopback upstream without credentials or forwarded headers', async () => {
  const code = 'd9428888-122b-4d5f-9a8b-9f7419b8451c';
  let request;
  const result = await fetchPublicCertificateVerification(code, async (input, init) => {
    request = { input, init };
    return { ok: true, json: async () => ({
      valid: true,
      certificate: {
        recipientName: 'Demo Student', courseTitle: 'Demo Course', issuerName: 'ProctoLearn',
        issuedAt: '2026-10-10T12:00:00.000Z', issuedVia: 'PROCTORED_EXAM', snapshotStatus: 'CAPTURED',
        email: 'private@example.invalid', revocationReason: 'private',
      },
      internal: 'must not pass through',
    }) };
  });
  assert.equal(request.input, `http://127.0.0.1:4000/certificates/verify/${code}`);
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.cache, 'no-store');
  assert.equal(request.init.credentials, 'omit');
  assert.equal(request.init.redirect, 'error');
  assert.ok(request.init.signal instanceof AbortSignal);
  assert.equal('headers' in request.init, false);
  assert.deepEqual(result, {
    valid: true,
    certificate: {
      recipientName: 'Demo Student', courseTitle: 'Demo Course', issuerName: 'ProctoLearn',
      issuedAt: '2026-10-10T12:00:00.000Z', issuedVia: 'PROCTORED_EXAM',
    },
  });
});

test('public certificate response preserves revoked and unknown states without leaking upstream fields', () => {
  assert.deepEqual(publicCertificateVerification({ valid: false, status: 'REVOKED', revocationReason: 'private' }), { valid: false, status: 'REVOKED' });
  assert.deepEqual(publicCertificateVerification({ valid: false, status: 'INTERNAL_STATE', reason: 'private' }), { valid: false });
  assert.equal(publicCertificateVerification({ valid: true, certificate: { recipientName: 'Student' } }), null);
});

test('public certificate bridge converts upstream and malformed-response failures to one unavailable error', async () => {
  await assert.rejects(
    fetchPublicCertificateVerification('d9428888-122b-4d5f-9a8b-9f7419b8451c', async () => { throw new Error('raw private failure'); }),
    (error) => error.name === 'PublicCertificateVerificationUnavailable' && !error.message.includes('private'),
  );
  await assert.rejects(
    fetchPublicCertificateVerification('d9428888-122b-4d5f-9a8b-9f7419b8451c', async () => ({ ok: true, json: async () => ({ valid: true, secret: 'private' }) })),
    (error) => error.name === 'PublicCertificateVerificationUnavailable',
  );
});

test('conflict at deadline stops recording immediately and submits only the fetched server snapshot', async () => {
  const waiting = deferred();
  const operations = [];
  const serverAnswers = [{ questionId: 'q', answer: 'from the other device' }];
  const work = finishExpiredConflict(
    async () => { operations.push('read'); return waiting.promise; },
    async (answers) => { operations.push('submit'); assert.deepEqual(answers, serverAnswers); return { passed: true }; },
    async () => { operations.push('stop'); },
  );
  assert.deepEqual(operations, ['stop', 'read']);
  waiting.resolve({ answers: serverAnswers, revision: 4, updatedAt: null });
  assert.deepEqual(await work, { passed: true });
  assert.deepEqual(operations, ['stop', 'read', 'submit']);
});

test('already expired conflict never resubmits and waits for final recording persistence', async () => {
  const finalChunk = deferred();
  const error = closed('EXAM_EXPIRED');
  let stopped = false;
  let settled = false;
  const work = finishExpiredConflict(
    async () => { throw error; },
    async () => { assert.fail('closed attempt must not submit'); },
    async () => { stopped = true; await finalChunk.promise; },
  );
  const result = work.catch((failure) => { settled = true; assert.equal(failure, error); });
  await new Promise(setImmediate);
  assert.equal(stopped, true);
  assert.equal(settled, false);
  finalChunk.resolve();
  await result;
  assert.equal(settled, true);
});

test('network failure while resolving deadline conflict still stops capture and preserves the error', async () => {
  let stops = 0;
  const error = new Error('offline');
  await assert.rejects(finishExpiredConflict(
    async () => { throw error; },
    async () => assert.fail('never submit an unknown server snapshot'),
    async () => { stops++; },
  ), (failure) => failure === error);
  assert.equal(stops, 1);
});

test('closed-draft responses are recognized without treating transient errors as completed exams', () => {
  for (const code of ['EXAM_EXPIRED', 'ATTEMPT_CLOSED', 'SUBMISSION_CONFLICT']) assert.equal(isClosedExamError(closed(code)), true);
  for (const error of [closed('DRAFT_CONFLICT'), new Error('offline'), { response: { status: 503 } }, null]) assert.equal(isClosedExamError(error), false);
});
