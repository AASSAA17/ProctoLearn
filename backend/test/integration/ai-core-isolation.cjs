// Opt-in acceptance against the isolated release profile; never part of normal CI.
// RUN_AI_CORE_ISOLATION=1 node scripts/demo-release.cjs exec backend test/integration/ai-core-isolation.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { setTimeout: delay } = require('node:timers/promises');
const { PrismaClient } = require('@prisma/client');

const backend = path.resolve(__dirname, '../..');
const profile = path.resolve(backend, '../.local/release-demo');
const base = 'http://127.0.0.1:4001';
const origin = 'http://localhost:3000';

function assertProfile() {
  let valid = false;
  try {
    const url = new URL(process.env.DATABASE_URL);
    const marker = JSON.parse(fs.readFileSync(path.join(profile, 'ownership.json'), 'utf8'));
    const running = JSON.parse(fs.readFileSync(path.join(profile, 'running.json'), 'utf8'));
    valid = process.env.RUN_AI_CORE_ISOLATION === '1' && process.env.E2E_DISPOSABLE === 'true'
      && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '5433'
      && url.pathname === '/proctolearn_release' && url.username === 'proctolearn_release'
      && process.env.MINIO_BUCKET === 'proctolearn-release'
      && marker.kind === 'proctolearn-isolated-release-v1' && running.ready === true
      && running.mode === 'application' && !running.restored;
  } catch {}
  assert.ok(valid, 'Opt-in isolated running release profile is required');
}

async function assertFree(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Required loopback port ${port} is occupied`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

async function assertProviderRefused() {
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: 11436 });
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); reject(new Error('Failure endpoint unexpectedly accepts connections')); });
    socket.once('timeout', () => { socket.destroy(); reject(new Error('Failure endpoint did not refuse promptly')); });
    socket.once('error', error => error.code === 'ECONNREFUSED' ? resolve() : reject(new Error('Failure endpoint was not confirmed refused')));
  });
}

async function stopOwned(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  if (!await Promise.race([exited.then(() => true), delay(5000).then(() => false)])) {
    child.kill('SIGKILL');
    assert.ok(await Promise.race([exited.then(() => true), delay(5000).then(() => false)]), 'Owned API must stop');
  }
}

test('closed Ollama endpoint leaves API readiness and public courses available', async t => {
  assertProfile();
  await assertFree(4001);
  await assertFree(11436);
  await assertProviderRefused();
  const marker = randomUUID();
  const email = `ai-isolation-${marker}@example.invalid`;
  const name = `AI isolation fixture ${marker}`;
  const cookies = new Map();
  let csrf;
  let child;
  let spawnFailed = false;
  const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

  async function request(route, method = 'GET', body) {
    const response = await fetch(base + route, {
      method, signal: AbortSignal.timeout(15000), redirect: 'error',
      headers: { Origin: origin, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(body ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';', 1)[0];
      const split = pair.indexOf('=');
      cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    return response;
  }

  async function checkCore(phase) {
    const [ready, courses] = await Promise.all([request('/ready'), request('/courses?limit=3')]);
    assert.equal(ready.status, 200, `${phase}: readiness HTTP status`);
    assert.equal(courses.status, 200, `${phase}: public courses HTTP status`);
    const state = await ready.json();
    assert.equal(state.status, 'ready');
    assert.deepEqual(state.dependencies, { database: 'up', storage: 'up' });
    await courses.arrayBuffer();
    t.diagnostic(`${phase}: ready=200 database=up storage=up courses=200`);
  }

  try {
    child = spawn(process.execPath, [path.join(backend, 'dist/src/main.js')], {
      cwd: backend, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'],
      env: { ...process.env, NODE_ENV: 'development', API_HOST: '127.0.0.1', API_PORT: '4001',
        AI_PROVIDER: 'ollama', OLLAMA_BASE_URL: 'http://127.0.0.1:11436',
        GRAPHITE_ENABLED: 'false', N8N_EXAM_SUBMIT_WEBHOOK_URL: '' },
    });
    child.once('error', () => { spawnFailed = true; });
    let ready = false;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && !spawnFailed && child.exitCode === null) {
      try {
        const response = await fetch(base + '/ready', { signal: AbortSignal.timeout(3000) });
        await response.arrayBuffer();
        if (response.status === 200) { ready = true; break; }
      } catch {}
      await delay(300);
    }
    assert.ok(ready, 'Owned API did not become ready within 30 seconds');
    await checkCore('before failure');
    let response = await request('/auth/csrf');
    assert.equal(response.status, 200, 'CSRF bootstrap');
    csrf = (await response.json()).csrfToken;
    response = await request('/auth/register', 'POST', { name, email, password: `Ai!!29${randomBytes(24).toString('hex')}` });
    assert.equal(response.status, 201, 'Disposable user registration');
    const registered = await response.json();
    assert.equal(registered.user?.role, 'STUDENT');
    response = await request('/auth/csrf');
    assert.equal(response.status, 200, 'Authenticated CSRF bootstrap');
    csrf = (await response.json()).csrfToken;
    const started = Date.now();
    const [chat] = await Promise.all([
      request('/ai/chat', 'POST', { message: 'Что такое HTML?' }),
      checkCore('concurrent with failure'),
    ]);
    assert.equal(chat.status, 201, 'Chat returns handled unavailable response');
    const answer = await chat.json();
    assert.equal(answer.reply, 'Жергілікті AI қазір жауап бере алмайды. / Локальный AI сейчас недоступен. Повторите позже; обучение и сертификаты продолжают работать.');
    t.diagnostic(`chat=201 explicit_unavailable=true elapsed_ms=${Date.now() - started}`);
    await assertProviderRefused();
    await checkCore('after failure');
  } finally {
    await stopOwned(child);
    try {
      // Exact unique fixture identity only; no existing demo account is touched.
      await db.user.deleteMany({ where: { email, name, role: 'STUDENT' } });
      assert.equal(await db.user.count({ where: { email } }), 0, 'Disposable fixture cleanup');
    } catch { throw new Error('Disposable fixture cleanup failed; inspect the dedicated release database privately'); }
    finally { await db.$disconnect(); }
    await assertFree(4001);
    t.diagnostic('owned_api_stopped=true disposable_user_removed=true owner_ollama_untouched=true');
  }
});
