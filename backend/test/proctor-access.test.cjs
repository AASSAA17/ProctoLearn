const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { EventEmitter } = require('node:events');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { PassportModule } = require('@nestjs/passport');
const { JwtService } = require('@nestjs/jwt');
const { ConfigService } = require('@nestjs/config');
const { ValidationPipe } = require('@nestjs/common');
const { PrismaService } = require('../src/prisma/prisma.service');
const { JwtStrategy } = require('../src/auth/strategies/jwt.strategy');
const { AttemptsController } = require('../src/attempts/attempts.controller');
const { AttemptsService } = require('../src/attempts/attempts.service');
const { EvidenceController } = require('../src/evidence/evidence.controller');
const { EvidenceService } = require('../src/evidence/evidence.service');
const { MinioService } = require('../src/minio/minio.service');
const { CertificatesService } = require('../src/certificates/certificates.service');
const { ProctorController } = require('../src/proctor/proctor.controller');
const { ProctorService } = require('../src/proctor/proctor.service');
const { ProctorGateway } = require('../src/proctor/proctor.gateway');

// Exercise actual HTTP/WS controllers, guards, JWT validation and services. Only
// persistence/storage are replaced, so an omitted scope or guard leaks fixtures.
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return [].concat(value).every((part) => matches(row, part));
    if (key === 'OR') return value.some((part) => matches(row, part));
    const actual = row?.[key];
    if (value && typeof value === 'object') {
      if ('some' in value) return actual.some((item) => matches(item, value.some));
      if ('not' in value) return actual !== value.not;
      return matches(actual, value);
    }
    return actual === value;
  });
}

async function fixture(withGateway = false) {
  const users = new Map([
    ['student-a', 'STUDENT'], ['student-b', 'STUDENT'],
    ['teacher-a', 'TEACHER'], ['teacher-b', 'TEACHER'],
    ['assigned', 'PROCTOR'], ['unassigned', 'PROCTOR'], ['admin', 'ADMIN'],
  ].map(([id, role]) => [id, { id, role, name: id, email: `${id}@example.invalid`, tokenVersion: 0 }]));
  const exams = new Map(['a', 'b'].map((key) => [`exam-${key}`, {
    id: `exam-${key}`, title: key, duration: 60, course: { teacherId: `teacher-${key}` },
  }]));
  const attempts = new Map(['a', 'b'].map((key) => [`attempt-${key}`, {
    id: `attempt-${key}`, examId: `exam-${key}`, userId: `student-${key}`,
    status: 'IN_PROGRESS', startedAt: new Date(), trustScore: 100,
  }]));
  const assignments = new Map([['exam-a:assigned', { examId: 'exam-a', proctorId: 'assigned' }]]);
  const signedObjects = [];
  const events = [];
  const hydrate = (attempt) => attempt && ({
    ...attempt, events: events.filter((event) => event.attemptId === attempt.id),
    exam: { ...exams.get(attempt.examId), proctorAssignments: [...assignments.values()].filter((entry) => entry.examId === attempt.examId) },
    user: users.get(attempt.userId), evidences: [{ id: `evidence-${attempt.id}`, url: `private/${attempt.id}.webm` }],
  });
  const db = {
    user: {
      findUnique: async ({ where }) => users.get(where.id) && { ...users.get(where.id) },
      update: async ({ where, data }) => Object.assign(users.get(where.id), data),
    },
    exam: { findUnique: async ({ where }) => exams.get(where.id) },
    examProctor: {
      findUnique: async ({ where: { examId_proctorId: key } }) => assignments.get(`${key.examId}:${key.proctorId}`),
      findMany: async ({ where }) => [...assignments.values()].filter((entry) => matches(entry, where)),
      upsert: async ({ create }) => { assignments.set(`${create.examId}:${create.proctorId}`, create); return create; },
      deleteMany: async ({ where }) => {
        const removed = [...assignments].filter(([, entry]) => matches(entry, where));
        removed.forEach(([key]) => assignments.delete(key));
        return { count: removed.length };
      },
    },
    attempt: {
      findUnique: async ({ where }) => hydrate(attempts.get(where.id)),
      findMany: async ({ where, skip = 0, take } = {}) => [...attempts.values()].map(hydrate).filter((row) => matches(row, where)).slice(skip, take === undefined ? undefined : skip + take),
      count: async ({ where }) => [...attempts.values()].map(hydrate).filter((row) => matches(row, where)).length,
      update: async ({ where, data }) => hydrate(Object.assign(attempts.get(where.id), data)),
    },
    evidenceFile: { findMany: async ({ where }) => [{ id: `evidence-${where.attemptId}`, attemptId: where.attemptId, type: 'recording_camera', url: `private/${where.attemptId}.webm` }] },
    proctorEvent: { create: async ({ data }) => { const event = { id: `event-${events.length}`, ...data }; events.push(event); return event; } },
    $transaction: async (work) => work(db),
  };
  const jwt = new JwtService();
  const secret = randomBytes(32).toString('hex');
  const config = new ConfigService({ JWT_ACCESS_SECRET: secret });
  const module = await Test.createTestingModule({
    imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
    controllers: [AttemptsController, EvidenceController, ProctorController],
    providers: [JwtStrategy, AttemptsService, EvidenceService, ProctorService,
      ...(withGateway ? [ProctorGateway] : []),
      { provide: PrismaService, useValue: db },
      { provide: ConfigService, useValue: config },
      { provide: JwtService, useValue: jwt },
      { provide: CertificatesService, useValue: {} },
      { provide: MinioService, useValue: { getPresignedUrl: async (name) => { signedObjects.push(name); return `https://storage.example.invalid/${name}?signed`; } } },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  const token = (id) => jwt.sign({ sub: id, ver: users.get(id).tokenVersion }, { secret, expiresIn: '5m' });
  const request = async (id, path, method = 'GET') => {
    const response = await fetch(`${origin}${path}`, { method, headers: id ? { Authorization: `Bearer ${token(id)}` } : {} });
    return { status: response.status, body: await response.json() };
  };
  return { app, origin, request, token, users, attempts, assignments, signedObjects, close: () => app.close() };
}

test('HTTP evidence and summaries require an assigned proctor, not merely its role', async () => {
  const f = await fixture();
  try {
    for (const route of ['/evidence/attempt-a', '/proctor/sessions/attempt-a']) {
      assert.equal((await f.request(null, route)).status, 401);
      for (const actor of ['unassigned', 'teacher-a', 'student-a']) {
        assert.equal((await f.request(actor, route)).status, 403, `${actor}: ${route}`);
      }
      assert.equal((await f.request('assigned', route)).status, 200);
      assert.equal((await f.request('admin', route.replace('attempt-a', 'attempt-b'))).status, 200);
      assert.equal((await f.request('assigned', route.replace('attempt-a', 'attempt-b'))).status, 403);
    }
    assert.deepEqual(f.signedObjects, ['private/attempt-a.webm', 'private/attempt-b.webm']);
  } finally { await f.close(); }
});

test('HTTP attempt listing scopes rows AND pagination totals by assignment or course ownership', async () => {
  const f = await fixture();
  try {
    for (const [actor, expected] of [['assigned', ['attempt-a']], ['unassigned', []], ['teacher-a', ['attempt-a']], ['teacher-b', ['attempt-b']], ['admin', ['attempt-a', 'attempt-b']]]) {
      const response = await f.request(actor, '/attempts');
      assert.equal(response.status, 200, actor);
      assert.deepEqual(response.body.data.map((row) => row.id), expected, actor);
      assert.equal(response.body.meta.total, expected.length, actor);
    }
    for (const actor of ['assigned', 'teacher-a']) {
      const response = await f.request(actor, '/attempts?examId=exam-b');
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, []);
      assert.equal(response.body.meta.total, 0);
    }
    assert.equal((await f.request('student-a', '/attempts')).status, 403);
  } finally { await f.close(); }
});

test('HTTP teacher results deny a foreign course while administrators can inspect it', async () => {
  const f = await fixture();
  try {
    f.attempts.get('attempt-a').status = 'FINISHED';
    f.attempts.get('attempt-b').status = 'FINISHED';
    const own = await f.request('teacher-a', '/attempts/exam/exam-a/results');
    assert.equal(own.status, 200);
    assert.deepEqual(own.body.map((row) => row.id), ['attempt-a']);
    assert.equal((await f.request('teacher-a', '/attempts/exam/exam-b/results')).status, 403);
    assert.equal((await f.request('assigned', '/attempts/exam/exam-a/results')).status, 403);
    const admin = await f.request('admin', '/attempts/exam/exam-b/results');
    assert.equal(admin.status, 200);
    assert.deepEqual(admin.body.map((row) => row.id), ['attempt-b']);
  } finally { await f.close(); }
});

test('HTTP assignment administration enforces course ownership and immediately revokes read access', async () => {
  const f = await fixture();
  try {
    const assignment = '/proctor/exams/exam-a/assignments/unassigned';
    assert.equal((await f.request('teacher-b', assignment, 'PUT')).status, 403);
    assert.equal((await f.request('assigned', assignment, 'PUT')).status, 403);
    assert.equal((await f.request('teacher-a', assignment.replace('unassigned', 'student-a'), 'PUT')).status, 400);
    assert.equal((await f.request('teacher-a', assignment, 'PUT')).status, 200);
    assert.equal((await f.request('unassigned', '/evidence/attempt-a')).status, 200);
    assert.equal((await f.request('teacher-b', '/proctor/exams/exam-a/assignments')).status, 403);
    const listed = await f.request('teacher-a', '/proctor/exams/exam-a/assignments');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 2);
    assert.equal((await f.request('teacher-b', assignment, 'DELETE')).status, 403);
    assert.equal((await f.request('teacher-a', assignment, 'DELETE')).status, 200);
    assert.equal((await f.request('unassigned', '/evidence/attempt-a')).status, 403);
    assert.equal((await f.request('unassigned', '/proctor/sessions/attempt-a')).status, 403);
    assert.equal((await f.request('admin', '/proctor/exams/exam-b/assignments/assigned', 'PUT')).status, 200);
  } finally { await f.close(); }
});

test('HTTP flag mutations cannot alter attempts outside the proctor assignment', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('unassigned', '/attempts/attempt-a/flag', 'PATCH')).status, 403);
    assert.equal((await f.request('assigned', '/attempts/attempt-b/flag', 'PATCH')).status, 403);
    assert.equal(f.attempts.get('attempt-a').status, 'IN_PROGRESS');
    assert.equal(f.attempts.get('attempt-b').status, 'IN_PROGRESS');
    assert.equal((await f.request('assigned', '/attempts/attempt-a/flag', 'PATCH')).status, 200);
    assert.equal((await f.request('admin', '/attempts/attempt-b/flag', 'PATCH')).status, 200);
    assert.equal(f.attempts.get('attempt-a').status, 'FLAGGED');
    assert.equal(f.attempts.get('attempt-b').status, 'FLAGGED');
  } finally { await f.close(); }
});

// Minimal Engine.IO v4/Socket.IO client over the standard Node 22 WebSocket.
// Keeps these backend tests independent from frontend devDependencies.
async function connectSocket(f, actor) {
  const bus = new EventEmitter();
  const received = [];
  const socket = new WebSocket(`${f.origin.replace('http:', 'ws:')}/socket.io/?EIO=4&transport=websocket`);
  const next = (event, timeout = 2500) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { bus.off(event, done); reject(new Error(`Timed out waiting for ${actor}:${event}`)); }, timeout);
    const done = (data) => { clearTimeout(timer); resolve(data); };
    bus.once(event, done);
  });
  const ready = next('ready');
  socket.addEventListener('message', ({ data }) => {
    const packet = String(data);
    if (packet.startsWith('0')) socket.send(`40/proctor,${JSON.stringify({ token: f.token(actor) })}`);
    else if (packet === '2') socket.send('3');
    else if (packet.startsWith('40/proctor,')) bus.emit('ready');
    else if (packet.startsWith('42/proctor,')) {
      const [event, value] = JSON.parse(packet.slice('42/proctor,'.length));
      received.push({ event, value });
      bus.emit(event, value);
    }
  });
  await ready;
  const send = (event, data) => socket.send(`42/proctor,${JSON.stringify([event, data])}`);
  const start = async (attemptId, role, allowed = true) => {
    const response = next(allowed ? 'proctor:started' : 'exception');
    send('proctor:start', { attemptId, role });
    return response;
  };
  const close = async () => {
    if (socket.readyState === WebSocket.CLOSED) return;
    await new Promise((resolve) => { socket.addEventListener('close', resolve, { once: true }); socket.close(); });
  };
  return { socket, received, next, send, start, close };
}

test('WebSocket subscriptions enforce assigned exams and prevent student role spoofing', async () => {
  const f = await fixture(true);
  const clients = [];
  try {
    const assigned = await connectSocket(f, 'assigned'); clients.push(assigned);
    const unassigned = await connectSocket(f, 'unassigned'); clients.push(unassigned);
    const student = await connectSocket(f, 'student-a'); clients.push(student);
    const teacher = await connectSocket(f, 'teacher-a'); clients.push(teacher);
    assert.equal((await assigned.start('attempt-a', 'proctor')).attemptId, 'attempt-a');
    await assigned.start('attempt-b', 'proctor', false);
    await unassigned.start('attempt-a', 'proctor', false);
    await student.start('attempt-a', 'proctor', false);
    await student.start('attempt-b', 'student', false);
    await teacher.start('attempt-a', 'proctor', false);
    assert.equal((await student.start('attempt-a', 'student')).attemptId, 'attempt-a');
    assert.equal(unassigned.received.some((entry) => entry.event === 'proctor:started'), false);
  } finally { await Promise.all(clients.map((client) => client.close())); await f.close(); }
});

test('WebSocket broadcasts stop immediately after assignment or token revocation', async () => {
  const f = await fixture(true);
  const clients = [];
  try {
    const assigned = await connectSocket(f, 'assigned'); clients.push(assigned);
    const admin = await connectSocket(f, 'admin'); clients.push(admin);
    const student = await connectSocket(f, 'student-a'); clients.push(student);
    await assigned.start('attempt-a', 'proctor');
    await admin.start('attempt-a', 'proctor');
    await student.start('attempt-a', 'student');
    const before = assigned.next('proctor:event:recorded');
    student.send('proctor:event', { attemptId: 'attempt-a', type: 'tab_switch' });
    assert.equal((await before).trustScore, 90);
    assert.equal((await f.request('teacher-a', '/proctor/exams/exam-a/assignments/assigned', 'DELETE')).status, 200);
    const adminAfter = admin.next('proctor:event:recorded');
    const studentAfter = student.next('proctor:event:recorded');
    student.send('proctor:event', { attemptId: 'attempt-a', type: 'fullscreen_exit' });
    assert.equal((await adminAfter).trustScore, 85);
    assert.equal((await studentAfter).trustScore, 85);
    // All room recipients are processed before a new student event is delivered.
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(assigned.received.filter((entry) => entry.event === 'proctor:event:recorded').length, 1);
    f.users.get('admin').tokenVersion++;
    const lastStudent = student.next('proctor:event:recorded');
    student.send('proctor:event', { attemptId: 'attempt-a', type: 'tab_switch' });
    assert.equal((await lastStudent).trustScore, 75);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(admin.received.filter((entry) => entry.event === 'proctor:event:recorded').length, 2);
  } finally { await Promise.all(clients.map((client) => client.close())); await f.close(); }
});
