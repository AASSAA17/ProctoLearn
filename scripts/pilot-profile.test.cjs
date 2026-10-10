'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PORTS, publicOrigin, runtimeEnvironment, promotionBackupEligible, ngrokTrafficPolicy, unresolvedCompiledAliases, safeName } = require('./pilot-profile.cjs');

test('pilot ports are isolated from the known-good demo profile', () => {
  assert.deepEqual(PORTS, { proxy: 3200, web: 3100, api: 4100, postgres: 5434, s3: 9100, s3grpc: 29100, master: 19433, volume: 19440, filer: 18988 });
  for (const demoPort of [3000, 4000, 5433, 9000]) assert.equal(Object.values(PORTS).includes(demoPort), false);
});

test('pilot origin accepts exact loopback HTTP or HTTPS and rejects unsafe alternatives', () => {
  assert.equal(publicOrigin({}), 'http://127.0.0.1:3200');
  assert.equal(publicOrigin({ PILOT_PUBLIC_APP_URL: 'https://assigned.example.test' }), 'https://assigned.example.test');
  for (const value of ['http://192.168.1.4:3200', 'https://user:pass@example.test', 'https://example.test/path', 'javascript:alert(1)']) {
    assert.throws(() => publicOrigin({ PILOT_PUBLIC_APP_URL: value }), /origin|HTTPS|HTTP/);
  }
});

test('public runtime pins origin, loopback proxy trust, pilot caps and secure production mode', () => {
  const runtime = runtimeEnvironment({ PRIVATE: 'preserved' }, 'https://assigned.example.test');
  assert.equal(runtime.NODE_ENV, 'production'); assert.equal(runtime.FRONTEND_URL, 'https://assigned.example.test');
  assert.equal(runtime.CERTIFICATE_PUBLIC_ORIGIN, 'https://assigned.example.test');
  assert.equal(runtime.TRUSTED_PROXIES, '127.0.0.1/32,::1/128');
  assert.equal(runtime.PILOT_MODE, 'true'); assert.equal(runtime.PILOT_MAX_PARTICIPANTS, '10'); assert.equal(runtime.PILOT_PUBLIC_SIGNUP, 'false');
  assert.equal(runtime.PRIVATE, 'preserved');
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']) assert.equal(runtime[key], '');
});

test('promotion requires a verified backup newer than the latest stopped session', () => {
  const release = '0123456789abcdef';
  const stale = { status: 'backup_verified', release, createdAt: '2026-10-10T10:05:00.000Z' };
  const lastRun = { release, startedAt: '2026-10-10T10:00:00.000Z', stoppedAt: '2026-10-10T10:10:00.000Z', status: 'stopped' };
  assert.equal(promotionBackupEligible(stale, release, lastRun), false);
  assert.equal(promotionBackupEligible({ ...stale, createdAt: '2026-10-10T10:11:00.000Z' }, release, lastRun), true);
  assert.equal(promotionBackupEligible({ ...stale, release: 'fedcba9876543210' }, release, lastRun), false);
  assert.equal(promotionBackupEligible({ ...stale, status: 'started' }, release, lastRun), false);
});

test('backup names are bounded and cannot escape the owned profile', () => {
  assert.equal(safeName('pilot-before-update_1'), 'pilot-before-update_1');
  for (const value of ['', '../escape', 'UPPER', 'a'.repeat(50)]) assert.throws(() => safeName(value));
});

test('ngrok policy removes visitor trust headers before edge metadata is injected', () => {
  const secret = 's'.repeat(43);
  const policy = ngrokTrafficPolicy(secret);
  assert.ok(policy.indexOf('type: remove-headers') < policy.indexOf('type: add-headers'));
  assert.match(policy, /x-proctolearn-client-ip: "\$\{conn\.client_ip\}"/);
  assert.match(policy, new RegExp(`x-proctolearn-gateway: "${secret}"`));
  assert.throws(() => ngrokTrafficPolicy('short'));
});

test('candidate validation detects TypeScript aliases that plain Node cannot resolve', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proctolearn-pilot-build-'));
  try {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'ok.js'), 'require("../common/ok")');
    assert.equal(unresolvedCompiledAliases(root), null);
    const broken = path.join(root, 'src', 'broken.js');
    fs.writeFileSync(broken, 'require("@/common/broken")');
    assert.equal(unresolvedCompiledAliases(root), broken);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
