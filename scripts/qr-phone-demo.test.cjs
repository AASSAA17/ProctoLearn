const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tunnelOrigin, safeCloudEnvironment, distinctFixtures, main } = require('./qr-phone-demo.cjs');
const { validateFixture } = require('./qr-demo-certificate.cjs');

test('only session-provided HTTPS Quick Tunnel origins are accepted', () => {
  assert.equal(tunnelOrigin('https://fictional-test-only.trycloudflare.com'), 'https://fictional-test-only.trycloudflare.com');
  for (const origin of ['http://example.trycloudflare.com', 'https://evil.example', 'https://x.trycloudflare.com.evil.example', 'https://x.trycloudflare.com/path', 'https://user@x.trycloudflare.com', 'https://x.trycloudflare.com?url=http://localhost', undefined]) assert.throws(() => tunnelOrigin(origin));
});

test('cloudflared cannot inherit unrelated tunnel configuration or credentials', () => {
  const before = process.env.TUNNEL_TOKEN;
  process.env.TUNNEL_TOKEN = 'fixture-do-not-forward';
  try {
    const env = safeCloudEnvironment();
    assert.equal(env.TUNNEL_TOKEN, undefined);
    assert.ok(Object.keys(env).every(key => ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'].includes(key)));
  } finally { if (before === undefined) delete process.env.TUNNEL_TOKEN; else process.env.TUNNEL_TOKEN = before; }
});

test('operator commands reject unsupported mutation and extra arguments', async () => {
  await assert.rejects(main(['reset']), /start\|check\|stop/);
  await assert.rejects(main(['start', '--public-all']), /start\|check\|stop/);
});

test('corrupt fictional certificate state cannot redirect PDF writes or reuse another slot', () => {
  const fixture = { kind: 'proctolearn-qr-fictional-certificate-v1', userId: 'd9428888-122b-4d5f-9a8b-9f7419b8451c',
    certificateId: 'd9428888-122b-4d5f-9a8b-9f7419b8451c', code: 'd9428888-122b-4d5f-9a8b-9f7419b8451c',
    email: 'qr-phone-d9428888-122b-4d5f-9a8b-9f7419b8451c@example.invalid', password: 'fictional-fixture-password-only', pdf: 'phone-certificate.pdf',
    snapshot: { issuedVia: 'ADMIN_OVERRIDE', issuedAt: '2026-10-10T12:00:00.000Z', recipientName: 'Demo', courseTitle: 'Demo' } };
  assert.equal(validateFixture(fixture, 'phone'), fixture);
  for (const value of [{ ...fixture, pdf: '../../tracked-file' }, { ...fixture, email: 'owner@example.com' }, { ...fixture, code: '../admin' }, { ...fixture, snapshot: null }]) assert.throws(() => validateFixture(value, 'phone'));
  assert.throws(() => validateFixture(fixture, 'revocation'));
});
test('a copied revocation fixture cannot target the primary scan certificate', () => {
  assert.doesNotThrow(() => distinctFixtures([{ userId: 'a', certificateId: 'b', code: 'c' }, { userId: 'd', certificateId: 'e', code: 'f' }]));
  assert.throws(() => distinctFixtures([{ userId: 'a', certificateId: 'b', code: 'c' }, { userId: 'd', certificateId: 'b', code: 'c' }]));
});
