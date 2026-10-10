const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ensureLocalEnvironment, connectionUrl, stopRequested } = require('./local-launch.cjs');

test('a delayed conditional stop cannot stop a replacement release session', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proctolearn-stop-'));
  const file = path.join(directory, 'stop-request');
  try {
    const first = '123@2026-10-10T12:00:00.000Z';
    const replacement = '123@2026-10-10T13:00:00.000Z';
    fs.writeFileSync(file, first + '\n');
    assert.equal(stopRequested(file, first), true);
    assert.equal(stopRequested(file, replacement), false, 'even PID reuse must not adopt the previous stop request');
    fs.writeFileSync(file, replacement + '\n');
    assert.equal(stopRequested(file, replacement), true);
  } finally { fs.unlinkSync(file); fs.rmdirSync(directory); }
});

test('local setup creates independent strong secrets and never changes existing settings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proctolearn-local-'));
  try {
    fs.writeFileSync(path.join(root, '.env'), 'POSTGRES_PASSWORD=existing-value\n');
    const env = ensureLocalEnvironment(root);
    assert.notEqual(env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET);
    assert.equal(env.JWT_ACCESS_SECRET.length, 64);
    assert.equal(env.ALLOW_DEMO_SEED, 'false');
    const snapshot = fs.readFileSync(path.join(root, '.env.local'), 'utf8');
    assert.deepEqual(ensureLocalEnvironment(root), env);
    assert.equal(fs.readFileSync(path.join(root, '.env.local'), 'utf8'), snapshot);
    assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), 'POSTGRES_PASSWORD=existing-value\n');
    fs.writeFileSync(path.join(root, '.env.local'), snapshot.replace('MINIO_ENDPOINT=127.0.0.1', 'MINIO_ENDPOINT=remote.example.com'));
    assert.throws(() => ensureLocalEnvironment(root), /isolated localhost/);
    fs.writeFileSync(path.join(root, '.env.local'), snapshot.replace(env.JWT_ACCESS_SECRET, 'short'));
    assert.throws(() => ensureLocalEnvironment(root), /JWT_ACCESS_SECRET/);
    assert.ok(fs.readFileSync(path.join(root, '.env.local'), 'utf8').includes('JWT_ACCESS_SECRET=short'));
  } finally {
    const resolved = fs.realpathSync(root);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('proctolearn-local-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

test('local database URL encodes credential punctuation instead of changing database identity', () => {
  const url = new URL(connectionUrl({ POSTGRES_USER: 'local', POSTGRES_PASSWORD: 'a:@/#?%b', POSTGRES_DB: 'proctolearn_local' }));
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '5433');
  assert.equal(decodeURIComponent(url.password), 'a:@/#?%b');
  assert.equal(url.pathname, '/proctolearn_local');
});
