const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { EventEmitter } = require('node:events');
const WebSocket = require('ws');
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
const { EvidenceRetentionService } = require('../src/evidence/evidence-retention.service');
const { RecordingUploadsService } = require('../src/evidence/recording-uploads.service');
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
    status: 'IN_PROGRESS', startedAt: new Date(), trustScore: 100, reviewStatus: 'PENDING', finishedAt: null,
  }]));
  const assignments = new Map([['exam-a:assigned', { examId: 'exam-a', proctorId: 'assigned' }]]);
  const signedObjects = [];
  const events = [];
  const hydrate = (attempt) => attempt && ({
    ...attempt, appeal: null, reviews: [], recordingUploads: [], events: events.filter((event) => event.attemptId === attempt.id),
    exam: { ...exams.get(attempt.examId), proctorAssignments: [...assignments.values()].filter((entry) => entry.examId === attempt.examId) },
    user: users.get(attempt.userId), evidences: [{ id: `evidence-${attempt.id}`, url: `private/${attempt.id}.webm` }],
  });
  const db = {
    auditEvent: { create: async ({ data }) => data },
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
    proctorEvent: { count: async ({ where }) => events.filter((event) => event.attemptId === where.attemptId && (!where.timestamp || event.timestamp >= where.timestamp.gte)).length, create: async ({ data }) => { const event = { id: `event-${events.length}`, timestamp: new Date(), ...data }; events.push(event); return event; } },
    $transaction: async (work) => work(db),
  };
  const jwt = new JwtService();
  const secret = randomBytes(32).toString('hex');
  const config = new ConfigService({ JWT_ACCESS_SECRET: secret });
  const module = await Test.createTestingModule({
    imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
    controllers: [AttemptsController, EvidenceController, ProctorController],
    providers: [JwtStrategy, AttemptsService, EvidenceService, ProctorService,
      { provide: RecordingUploadsService, useValue: {} },
      { provide: EvidenceRetentionService, useValue: {} },
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
    const response = await fetch(`${origin}${path}`, { method, headers: id ? { Cookie: `pl-access=${token(id)}` } : {} });
    return { status: response.status, body: await response.json() };
  };
  return { app, origin, request, token, users, attempts, assignments, signedObjects, events, close: () => app.close() };
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
    assert.equal(f.attempts.get('attempt-a').status, 'IN_PROGRESS');
    assert.equal(f.attempts.get('attempt-b').status, 'IN_PROGRESS');
    assert.ok(f.attempts.get('attempt-a').flaggedAt instanceof Date);
    assert.ok(f.attempts.get('attempt-b').flaggedAt instanceof Date);
  } finally { await f.close(); }
});

// Minimal Engine.IO v4/Socket.IO client over the standard Node 22 WebSocket.
// Keeps these backend tests independent from frontend devDependencies.
async function connectSocket(f, actor) {
  const bus = new EventEmitter();
  const received = [];
  const socket = new WebSocket(`${f.origin.replace('http:', 'ws:')}/socket.io/?EIO=4&transport=websocket`, { headers: { Origin: 'http://localhost:3000', Cookie: `pl-access=${f.token(actor)}` } });
  const next = (event, timeout = 2500) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { bus.off(event, done); reject(new Error(`Timed out waiting for ${actor}:${event}`)); }, timeout);
    const done = (data) => { clearTimeout(timer); resolve(data); };
    bus.once(event, done);
  });
  const ready = next('ready');
  socket.addEventListener('message', ({ data }) => {
    const packet = String(data);
    if (packet.startsWith('0')) socket.send('40/proctor,{}');
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

const { ProctorEventLimiter, MAX_PROCTOR_EVENTS, PROCTOR_EVENTS_PER_MINUTE, validateEventMetadata } = require('../src/proctor/proctor-event-policy');

test('event budget bounds bursts, refills, and bounds memory', () => {
  const limiter = new ProctorEventLimiter();
  for (let i = 0; i < 10; i++) limiter.consume('student', 0);
  assert.throws(() => limiter.consume('student', 999), (e) => e.getStatus() === 429);
  limiter.consume('student', 1000);
  assert.throws(() => limiter.consume('student', 1000));
  limiter.consume('other', 1000);
  for (let i = 0; i < 9998; i++) limiter.consume(`user-${i}`, 1000);
  assert.throws(() => limiter.consume('overflow', 1000));
  limiter.consume('after-cleanup', 61_000);
  assert.equal(limiter.buckets.size, 1);
});

test('metadata rejects oversized UTF-8, arrays, null and circular payloads', () => {
  assert.doesNotThrow(() => validateEventMetadata({ action: 'copy' }));
  assert.doesNotThrow(() => validateEventMetadata(undefined));
  const cycle = {}; cycle.self = cycle;
  for (const value of [{ text: 'a'.repeat(2048) }, { text: '界'.repeat(700) }, [], null, cycle]) {
    assert.throws(() => validateEventMetadata(value), (e) => e.getStatus() === 400);
  }
});

test('transactional event rate/total limits reject before insert or trust deduction', async () => {
  let writes = 0, total = MAX_PROCTOR_EVENTS, recent = 0;
  const queries = [];
  const db = {
    $transaction: async (work, options) => { assert.equal(options.isolationLevel, 'Serializable'); return work(db); },
    attempt: {
      findUnique: async () => ({ id: 'attempt', userId: 'student', status: 'IN_PROGRESS', startedAt: new Date(), exam: { duration: 30 }, trustScore: 100 }),
      update: async () => { writes++; },
    },
    proctorEvent: {
      count: async ({ where }) => { queries.push(where); return where.timestamp ? recent : total; },
      create: async () => { writes++; },
    },
  };
  const service = new ProctorService(db);
  await assert.rejects(service.recordEvent('attempt', 'student', 'tab_switch'), (e) => e.getStatus() === 429);
  total = 0; recent = PROCTOR_EVENTS_PER_MINUTE;
  await assert.rejects(service.recordEvent('attempt', 'student', 'tab_switch'), (e) => e.getStatus() === 429);
  assert.equal(writes, 0);
  assert.equal(queries[1].attemptId, 'attempt');
  assert.ok(queries[1].timestamp.gte instanceof Date);
});

test('gateway flood budget follows user across sockets and attempt IDs before database work', async () => {
  const jwt = new JwtService();
  const secret = randomBytes(32).toString('hex');
  const config = new ConfigService({ JWT_ACCESS_SECRET: secret });
  let reads = 0, writes = 0;
  const gateway = new ProctorGateway({ recordEvent: async () => { writes++; return {}; } }, jwt, config,
    { user: { findUnique: async ({ where }) => { reads++; return { id: where.id, role: 'STUDENT', tokenVersion: 0 }; } } });
  gateway.server = { in: () => ({ fetchSockets: async () => [] }) };
  const errors = [];
  const socket = (id) => ({ data: {}, handshake: { headers: { origin: 'http://localhost:3000', cookie: `pl-access=${jwt.sign({ sub: id, ver: 0 }, { secret, expiresIn: '5m' })}` } }, emit(event, payload) { errors.push({ event, payload }); }, disconnect() {} });
  const first = socket('student'), second = socket('student'), other = socket('other');
  const now = Date.now(), limiter = gateway.eventLimiter;
  gateway.eventLimiter = { consume: (id) => limiter.consume(id, now) };
  try {
    for (let i = 0; i < 10; i++) await gateway.handleEvent(i % 2 ? first : second, { attemptId: `attempt-${i}`, type: 'tab_switch' });
    assert.equal(reads, 10); assert.equal(writes, 10);
    for (let i = 0; i < 100; i++) await gateway.handleEvent(i % 2 ? first : second, { attemptId: 'another', type: 'tab_switch' });
    assert.equal(reads, 10); assert.equal(writes, 10);
    assert.equal(errors.length, 100);
    assert.ok(errors.every(({ event, payload }) => event === 'proctor:error' && payload.code === 'PROCTOR_EVENT_LIMIT' && typeof payload.message === 'string'));
    await gateway.handleEvent(other, { attemptId: 'other-attempt', type: 'tab_switch' });
    assert.equal(writes, 11);
    await gateway.handleEvent(other, { attemptId: 'other-attempt', type: 'tab_switch', metadata: { text: 'x'.repeat(3000) } });
    assert.equal(errors.at(-1).event, 'proctor:error');
    assert.equal(errors.at(-1).payload.code, 'PROCTOR_METADATA_INVALID');
    assert.equal(typeof errors.at(-1).payload.message, 'string');
    assert.equal(reads, 11); assert.equal(writes, 11);
  } finally { for (const client of [first, second, other]) gateway.handleDisconnect(client); }
});

test('mandatory password change blocks connections, existing senders, and broadcast recipients', async () => {
  const f = await fixture(true);
  const clients = [];
  try {
    const assigned = await connectSocket(f, 'assigned'); clients.push(assigned);
    const student = await connectSocket(f, 'student-a'); clients.push(student);
    await assigned.start('attempt-a', 'proctor');
    await student.start('attempt-a', 'student');
    f.users.get('assigned').mustChangePassword = true;
    const recorded = student.next('proctor:event:recorded');
    student.send('proctor:event', { attemptId: 'attempt-a', type: 'tab_switch' });
    await recorded;
    assert.equal(assigned.received.some((entry) => entry.event === 'proctor:event:recorded'), false);
    f.users.get('student-a').mustChangePassword = true;
    const unauthorized = student.next('proctor:error');
    student.send('proctor:event', { attemptId: 'attempt-a', type: 'tab_switch' });
    assert.equal((await unauthorized).code, 'UNAUTHORIZED');
    let disconnected = false;
    const client = { data: {}, handshake: { headers: { origin: 'http://localhost:3000', cookie: `pl-access=${f.token('assigned')}` } }, emit() {}, disconnect() { disconnected = true; } };
    await f.app.get(ProctorGateway).handleConnection(client);
    assert.equal(disconnected, true);
  } finally { await Promise.all(clients.map((client) => client.close())); await f.close(); }
});


test('real event socket receives policy and DTO rejections without persisted events or score changes', async () => {
  const f = await fixture(true);
  const clients = [];
  try {
    const student = await connectSocket(f, 'student-a'); clients.push(student);
    await student.start('attempt-a', 'student');
    const reject = async (metadata, code) => {
      const response = student.next('proctor:error');
      student.send('proctor:event', { attemptId: 'attempt-a', type: 'tab_switch', metadata });
      const error = await response;
      assert.equal(error.code, code);
      assert.equal(typeof error.message, 'string');
      assert.ok(error.message.length > 0);
      assert.equal(f.events.length, 0);
      assert.equal(f.attempts.get('attempt-a').trustScore, 100);
    };
    await reject({ text: 'x'.repeat(3000) }, 'PROCTOR_METADATA_INVALID');
    await reject([], 'PROCTOR_EVENT_REJECTED');
    const db = f.app.get(PrismaService);
    db.proctorEvent.count = async () => MAX_PROCTOR_EVENTS;
    await reject({}, 'PROCTOR_EVENT_LIMIT');
    const gateway = f.app.get(ProctorGateway);
    const now = Date.now();
    const limiter = new ProctorEventLimiter();
    for (let i = 0; i < 10; i++) limiter.consume('student-a', now);
    gateway.eventLimiter = { consume: (id) => limiter.consume(id, now) };
    await reject({}, 'PROCTOR_EVENT_LIMIT');
    assert.equal(student.received.some(({ event }) => event === 'exception'), false);
  } finally { await Promise.all(clients.map((client) => client.close())); await f.close(); }
});
