#!/usr/bin/env node
'use strict';
// Bounded localhost acceptance workload, never a public-provider load test.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { randomUUID, randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { prepare, environment } = require('./demo-release-tests.cjs');
const { createPilotProxy } = require('./pilot-proxy.cjs');
const ROOT = path.resolve(__dirname, '..');
const req = createRequire(path.join(ROOT, 'backend/package.json'));
const webRequire = createRequire(path.join(ROOT, 'frontend/package.json'));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const ORIGIN = 'http://127.0.0.1:3200';
function resource(pids) {
  const output = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,WorkingSet64,@{Name='CpuSeconds';Expression={$_.TotalProcessorTime.TotalSeconds}} | ConvertTo-Json -Compress`], { encoding: 'utf8', windowsHide: true });
  try { return JSON.parse(output.stdout || '[]'); } catch { return []; }
}
async function main() {
  const fixture = path.join(ROOT, '.local/release-tests');
  const state = JSON.parse(fs.readFileSync(path.join(fixture, 'running.json')));
  assert.equal(state.ready, true); process.kill(state.pid, 0);
  const candidate = JSON.parse(fs.readFileSync(path.join(ROOT, '.local/pilot/candidate.json')));
  assert.equal(candidate.status, 'validated');
  const lock = path.join(fixture, 'suite.lock');
  const token = randomUUID();
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, token, command: 'pilot-learning-workload' }), { flag: 'wx' });
  const env = { ...environment(prepare()), NODE_ENV: 'development', API_HOST: '127.0.0.1', API_PORT: '4100',
    PORT: '4100', FRONTEND_URL: ORIGIN, CERTIFICATE_PUBLIC_ORIGIN: ORIGIN, TRUSTED_PROXIES: '127.0.0.1,::1',
    PILOT_MODE: 'true', PILOT_MAX_PARTICIPANTS: '10', PILOT_DEFAULT_COURSE_SEATS: '10', PILOT_PUBLIC_SIGNUP: 'false',
    AI_ENABLED: 'false', AI_PROVIDER: 'disabled', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', ALLOW_DEMO_SEED: 'false' };
  assert.equal(new URL(env.DATABASE_URL).pathname, '/proctolearn_security_test');
  assert.equal(new URL(env.DATABASE_URL).port, '55432');
  const { PrismaClient } = req('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  const owner = randomUUID(); const courseId = randomUUID(); const lessonId = randomUUID(); const stepId = randomUUID(); const examId = randomUUID();
  // Meet the shared password policy deterministically; the random suffix must
  // add entropy, not decide whether the fixture happens to be valid.
  const password = `Synthetic!!99${randomBytes(24).toString('base64url')}`;
  const children = new Set(); const users = []; let proxy; let api; let mediaAttempt; let storage;
  const report = { startedAt: new Date().toISOString(), candidate: candidate.id, sourceHead: candidate.head,
    sourceDirty: candidate.dirty, target: 'owned disposable PostgreSQL 55432 / localhost proxy 3200',
    publicTLS: 'NOT_TESTED', physicalPhone: 'AWAITING_OPERATOR', upstreamBandwidth: 'NOT_MEASURED',
    phases: [], requests: 0, responseBytes: 0, assertions: [] };
  function start(file, args, childEnv, name) {
    const log = fs.openSync(path.join(fixture, `${name}.private.log`), 'a');
    const child = spawn(process.execPath, [file, ...args], { cwd: name === 'workload-web' ? path.join(ROOT, 'frontend') : path.join(ROOT, 'backend'), env: childEnv, windowsHide: true, stdio: ['ignore', log, log] });
    fs.closeSync(log); children.add(child); child.once('exit', () => children.delete(child)); return child;
  }
  async function ready(url, child) {
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Owned application child exited; inspect private test log');
      try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); await response.body?.cancel(); if (response.ok) return; } catch {}
      await wait(300);
    }
    throw new Error('Owned test application readiness timed out');
  }
  const client = (base = ORIGIN + '/api') => {
    const cookies = new Map(); const times = [];
    async function call(route, body, expected = body === undefined ? 200 : 201, verb) {
      const csrf = body === undefined ? undefined : (await call('/auth/csrf')).csrfToken;
      const began = performance.now();
      const response = await fetch(base + route, { method: verb || (body === undefined ? 'GET' : 'POST'), redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Origin: ORIGIN, Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), ...(body === undefined ? {} : { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), 'X-CSRF-Token': csrf }) },
        ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) });
      for (const header of response.headers.getSetCookie()) { const pair = header.split(';')[0]; const i = pair.indexOf('='); cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
      const text = await response.text(); report.requests++; report.responseBytes += Buffer.byteLength(text); times.push(performance.now() - began);
      if (response.status !== expected) throw new Error(`${route.split('/').slice(0, 2).join('/')} expected ${expected}, got ${response.status}: ${JSON.parse(text).message}`);
      return text ? JSON.parse(text) : null;
    }
    return { call, times, cookies };
  };
  try {
    assert.equal(await db.pilotMembership.count(), 0, 'Do not adopt a fixture with unrelated pilot members');
    await db.user.create({ data: { id: owner, name: 'Synthetic workload owner', email: `${owner}@example.invalid`, role: 'ADMIN', password: await req('bcryptjs').hash(password, 12) } });
    await db.course.create({ data: { id: courseId, title: 'Synthetic disposable workload fixture', teacherId: owner, status: 'PUBLISHED', publishedAt: new Date(),
      exams: { create: { id: examId, title: 'Synthetic disposable recording fixture', duration: 5, passScore: 100, questions: { create: { text: 'Generic disposable One/Two question', type: 'SINGLE_CHOICE', options: ['One', 'Two'], answer: 'One' } } } },
      lessons: { create: { id: lessonId, title: 'Synthetic reading', order: 1, content: '<p>Local disposable fixture only.</p>', steps: { create: { id: stepId, type: 'TASK', order: 1,
        content: { question: 'Generic fixture: choose one', taskType: 'single_choice', options: ['One', 'Two'], correctAnswer: 'One' } } } } } } });
    api = start(candidate.backendEntry, [], env, 'workload-api'); await ready('http://127.0.0.1:4100/health', api);
    const web = start(path.join(ROOT, 'frontend/node_modules/next/dist/bin/next'), ['start', '-H', '127.0.0.1', '-p', '3100'],
      { ...env, NODE_ENV: 'production', NEXT_DIST_DIR: candidate.frontendDist, INTERNAL_API_ORIGIN: 'http://127.0.0.1:4100' }, 'workload-web');
    await ready('http://127.0.0.1:3100/auth/login', web);
    proxy = createPilotProxy(); proxy.listen(3200, '127.0.0.1'); await once(proxy, 'listening');
    const staff = client('http://127.0.0.1:4100');
    await staff.call('/auth/login', { email: `${owner}@example.invalid`, password });
    const visitor = client();
    await visitor.call('/auth/register', { name: 'Uninvited synthetic', email: `${randomUUID()}@example.invalid`, password }, 403);
    report.assertions.push('Uninvited registration denied');
    for (const count of [1, 3, 5]) {
      // Registration quota is deliberately preserved: 5/IP/minute. Wait before
      // the third phase rather than weakening or spoofing the application guard.
      if (count === 5) { console.log('Preserving registration quota; waiting for its next local window.'); await wait(61000); }
      const group = [];
      for (let i = 0; i < count; i++) {
        const email = `${randomUUID()}@example.invalid`;
        const invitation = await staff.call('/pilot/invitations', { email });
        const learner = client();
        const registered = await learner.call('/auth/register', { name: 'Synthetic workload learner', email, password, invitationToken: invitation.activationToken });
        users.push(registered.user.id); group.push(learner);
        await learner.call(`/enrollments/courses/${courseId}`, {});
      }
      const began = performance.now(); const before = report.requests; const bytes = report.responseBytes;
      for (const learner of group) learner.times.length = 0;
      const pids = [api.pid, web.pid]; const beforeResources = resource(pids);
      await Promise.all(group.map(async learner => {
        for (let cycle = 0; cycle < 5; cycle++) {
          const material = await learner.call(`/courses/${courseId}/material`);
          assert.equal(JSON.stringify(material).includes('correctAnswer'), false, 'Private key leaked');
          const answer = await learner.call(`/steps/${stepId}/submit`, { answer: { selected: 'One' } }); assert.equal(answer.isCorrect, true);
          await learner.call(`/courses/${courseId}/lessons/${lessonId}/complete`, {});
          const progress = await learner.call(`/courses/${courseId}/lessons/progress/my`); assert.equal(progress[0].completed, true);
          await wait(2000);
        }
      }));
      const latencies = group.flatMap(value => value.times).sort((a, b) => a - b);
      const duration = (performance.now() - began) / 1000;
      report.phases.push({ simultaneousLearningClients: count, cyclesPerClient: 5, durationSeconds: duration,
        requests: report.requests - before, responseBytes: report.responseBytes - bytes, requestsPerSecond: (report.requests - before) / duration,
        failedRequests: 0, latencyP50Ms: latencies[Math.floor(latencies.length * .5)], latencyP95Ms: latencies[Math.floor(latencies.length * .95)],
        processResourcesBefore: beforeResources, processResourcesAfter: resource(pids) });
      console.log(`Local learning phase ${count} completed.`);
    }
    assert.equal(await db.lessonProgress.count({ where: { courseId } }), 9);
    assert.equal(await db.submission.count({ where: { stepId, isCorrect: true } }), 45);
    report.assertions.push('9 individual progress rows; 45 owned submissions; no answer keys in material');
    const reconnect = client(); const first = await db.user.findUnique({ where: { id: users[0] } });
    await reconnect.call('/auth/login', { email: first.email, password });
    const secondClient = client(); const secondUser = await db.user.findUnique({ where: { id: users[1] } });
    await secondClient.call('/auth/login', { email: secondUser.email, password });
    const attempt = await reconnect.call(`/attempts/start/${examId}`, {}); mediaAttempt = attempt.id;
    await secondClient.call(`/attempts/${attempt.id}`, undefined, 403);
    const upload = await reconnect.call(`/evidence/${attempt.id}/uploads`, { kind: 'camera', clientSessionId: randomUUID(), mimeType: 'video/webm' });
    await secondClient.call(`/evidence/uploads/${upload.id}`, undefined, 403);
    const clip = fs.readFileSync(path.join(ROOT, 'frontend/public/demo/html-structure.webm'));
    assert.ok(clip.length < 2 * 1024 * 1024, 'Bounded real authored clip only');
    const parts = [clip.subarray(0, Math.floor(clip.length / 2)), clip.subarray(Math.floor(clip.length / 2))];
    const mediaBegan = performance.now();
    for (const index of [1, 0, 0]) {
      const form = new FormData(); form.append('file', new Blob([parts[index]], { type: 'video/webm' }), 'fictional-author-example.webm');
      await reconnect.call(`/evidence/uploads/${upload.id}/chunks/${index}`, form, 200, 'PUT');
    }
    const completed = await reconnect.call(`/evidence/uploads/${upload.id}/complete`, { expectedChunks: 2 });
    const evidence = await db.evidenceFile.findUnique({ where: { id: completed.evidenceId } });
    const files = await staff.call(`/evidence/${attempt.id}`);
    const playbackUrl = files.find(value => value.id === evidence.id).url;
    assert.equal(new URL(playbackUrl).origin, 'http://127.0.0.1:19000', 'Local staff playback remains private');
    const range = await fetch(playbackUrl, { headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(5000) });
    assert.equal(range.status, 206); const rangeBytes = Buffer.from(await range.arrayBuffer()); assert.deepEqual(rangeBytes, clip.subarray(0, 1024));
    const unsigned = new URL(playbackUrl); unsigned.search = '';
    const anonymous = await fetch(unsigned, { signal: AbortSignal.timeout(5000) }); assert.ok([401, 403].includes(anonymous.status)); await anonymous.body?.cancel();
    report.media = { actualClipBytes: clip.length, uploadedBytesIncludingIdempotentRetry: parts[1].length + 2 * parts[0].length,
      seconds: (performance.now() - mediaBegan) / 1000, uploadPath: 'Authenticated actual proxy, out-of-order chunks and retry',
      playbackPath: 'Local authorized staff signed private S3 URL, 206 range of 1024 bytes', remoteStaffPlayback: 'NOT_EXPOSED' };
    report.assertions.push('Second user denied other attempt/upload; private S3 anonymous denied; actual bounded recording upload/retry/assembly and local authorized Range');
    const { io } = webRequire('socket.io-client');
    const socket = io(ORIGIN + '/proctor', { transports: ['websocket'], reconnection: false, timeout: 10000,
      extraHeaders: { Origin: ORIGIN, Cookie: [...reconnect.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } });
    try { await Promise.race([once(socket, 'connect'), once(socket, 'connect_error').then(([error]) => { throw error; })]); report.assertions.push('Authenticated Socket.IO forced WebSocket handshake through actual proxy'); }
    finally { socket.disconnect(); }
    await reconnect.call('/auth/logout', {});
    api.kill(); await once(api, 'exit');
    api = start(candidate.backendEntry, [], env, 'workload-api'); await ready('http://127.0.0.1:4100/health', api);
    await reconnect.call('/auth/login', { email: first.email, password });
    const persisted = await reconnect.call(`/courses/${courseId}/lessons/progress/my`); assert.equal(persisted[0].completed, true);
    assert.equal(await db.lessonProgress.count({ where: { courseId } }), 9);
    report.assertions.push('Progress retained after logout and actual backend process restart');
    report.result = 'PASS';
  } catch (error) { report.result = 'FAIL'; report.failure = error.message; throw error; }
  finally {
    if (proxy) await new Promise(resolve => { proxy.close(resolve); proxy.closeAllConnections(); });
    for (const child of children) child.kill();
    await Promise.all([...children].map(child => child.exitCode === null ? once(child, 'exit') : Promise.resolve()));
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(fixture, 'pilot-learning-workload.json'), JSON.stringify(report, null, 2));
    try {
    if (mediaAttempt) {
      const { MinioService } = require(path.join(path.dirname(candidate.backendEntry), 'minio/minio.service.js'));
      storage = new MinioService(new (req('@nestjs/config').ConfigService)(env));
      for (const prefix of [`recordings/${mediaAttempt}/`, `staging/${mediaAttempt}/`]) for (const object of await storage.listObjects(prefix)) await storage.removeObject(object.name);
      storage.onModuleDestroy();
    }
    await db.attempt.deleteMany({ where: { examId, userId: { in: users } } });
    await db.course.deleteMany({ where: { id: courseId, teacherId: owner } });
    await db.pilotMembership.deleteMany({ where: { userId: { in: users } } });
    await db.pilotInvitation.deleteMany({ where: { createdById: owner } });
    await db.user.deleteMany({ where: { id: { in: [owner, ...users] } } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: [owner, ...users] } } });
    } finally {
      await db.$disconnect();
      if (JSON.parse(fs.readFileSync(lock)).token === token) fs.unlinkSync(lock);
    }
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
