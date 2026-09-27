const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { readdir } = require('node:fs/promises');
const { EventEmitter } = require('node:events');
const WebSocket = require('ws');
require('reflect-metadata');
const bcrypt = require('bcryptjs');
const { Test } = require('@nestjs/testing');
const { APP_GUARD } = require('@nestjs/core');
const { PassportModule } = require('@nestjs/passport');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { ValidationPipe } = require('@nestjs/common');
const { AuthService } = require('../src/auth/auth.service');
const { AuthController } = require('../src/auth/auth.controller');
const { AuthCookies, authCookieNames } = require('../src/auth/auth-cookies');
const { CsrfService } = require('../src/auth/csrf.service');
const { CsrfGuard } = require('../src/auth/csrf.guard');
const { JwtStrategy } = require('../src/auth/strategies/jwt.strategy');
const { PrismaService } = require('../src/prisma/prisma.service');
const { MailService } = require('../src/mail/mail.service');
const { EvidenceController, RECORDING_DIRECTORY } = require('../src/evidence/evidence.controller');
const { EvidenceService } = require('../src/evidence/evidence.service');
const { RecordingUploadsService } = require('../src/evidence/recording-uploads.service');
const { ProctorGateway } = require('../src/proctor/proctor.gateway');
const { ProctorService } = require('../src/proctor/proctor.service');

// Actual controllers, DTO validation, passport strategy, CSRF guard and socket
// transport. Only external persistence, email and storage IO are fixtures.
async function fixture(production = false) {
  const frontend = production ? 'https://learn.example.invalid' : 'http://localhost:3000';
  const config = new ConfigService({ NODE_ENV: production ? 'production' : 'test', FRONTEND_URL: frontend, JWT_ACCESS_SECRET: randomBytes(48).toString('hex'), JWT_REFRESH_SECRET: randomBytes(48).toString('hex') });
  const users = new Map();
  const user = { id: randomUUID(), name: 'Student', email: 'student@example.invalid', role: 'STUDENT', password: await bcrypt.hash('Initial!!12', 4), tokenVersion: 0, refreshToken: null, mustChangePassword: false };
  users.set(user.id, user);
  const resets = new Map();
  const match = (row, where) => row && Object.entries(where).every(([key, value]) => row[key] === value);
  const mutate = (row, data) => { for (const [key, value] of Object.entries(data)) row[key] = value?.increment !== undefined ? row[key] + value.increment : value; return { ...row }; };
  const db = {
    user: {
      findUnique: async ({ where }) => { const found = [...users.values()].find((row) => match(row, where)); return found ? { ...found } : null; },
      create: async ({ data }) => { const created = { id: randomUUID(), role: 'STUDENT', tokenVersion: 0, refreshToken: null, mustChangePassword: false, createdAt: new Date(), ...data }; users.set(created.id, created); return { ...created }; },
      update: async ({ where, data }) => mutate([...users.values()].find((row) => match(row, where)), data),
      updateMany: async ({ where, data }) => { const found = [...users.values()].filter((row) => match(row, where)); found.forEach((row) => mutate(row, data)); return { count: found.length }; },
    },
    passwordResetToken: {
      create: async ({ data }) => { resets.set(data.token, data); return data; },
      findUnique: async ({ where }) => resets.get(where.token),
      deleteMany: async ({ where }) => { let count = 0; for (const [key, row] of resets) if (match(row, where)) { resets.delete(key); count++; } return { count }; },
    },
    $transaction: async (work) => work(db),
  };
  const mail = { sendPasswordReset: async (_email, _name, token) => { mail.resetToken = token; } };
  const calls = { uploadAuthorize: 0, uploadWrite: 0, socketAccess: 0, socketEvents: 0 };
  const uploads = {
    assertWritableUpload: async () => { calls.uploadAuthorize++; },
    putChunk: async () => { calls.uploadWrite++; return { index: 0 }; },
  };
  const proctor = {
    assertSessionAccess: async () => { calls.socketAccess++; },
    recordEvent: async () => { calls.socketEvents++; return { trustScore: 90 }; },
  };
  const jwt = new JwtService();
  const module = await Test.createTestingModule({
    imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
    controllers: [AuthController, EvidenceController],
    providers: [AuthService, AuthCookies, CsrfService, CsrfGuard, JwtStrategy, ProctorGateway,
      { provide: APP_GUARD, useExisting: CsrfGuard },
      { provide: ConfigService, useValue: config }, { provide: JwtService, useValue: jwt },
      { provide: PrismaService, useValue: db }, { provide: MailService, useValue: mail },
      { provide: EvidenceService, useValue: {} }, { provide: RecordingUploadsService, useValue: uploads },
      { provide: ProctorService, useValue: proctor },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const names = authCookieNames(config);
  function browser() {
    const jar = new Map();
    let csrfToken;
    const cookie = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    const request = async (path, { method = 'GET', body, headers = {}, applyCookies = true } = {}) => {
      const requestHeaders = { Origin: frontend, ...(cookie() ? { Cookie: cookie() } : {}), ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...headers };
      for (const [key, value] of Object.entries(requestHeaders)) if (value === undefined) delete requestHeaders[key];
      const raw = body instanceof FormData;
      if (body !== undefined && !raw) requestHeaders['Content-Type'] = 'application/json';
      const response = await fetch(`${base}${path}`, { method, headers: requestHeaders, ...(body !== undefined ? { body: raw ? body : JSON.stringify(body) } : {}) });
      const setCookies = response.headers.getSetCookie();
      if (applyCookies) for (const header of setCookies) { const [pair] = header.split(';'); const separator = pair.indexOf('='); const name = pair.slice(0, separator); const value = pair.slice(separator + 1); if (!value) jar.delete(name); else jar.set(name, value); }
      return { status: response.status, body: await response.json(), headers: response.headers, setCookies };
    };
    const csrf = async () => { const result = await request('/auth/csrf'); assert.equal(result.status, 200); csrfToken = result.body.csrfToken; return result; };
    const login = async () => { await csrf(); const result = await request('/auth/login', { method: 'POST', body: { email: user.email, password: 'Initial!!12' } }); assert.equal(result.status, 201); await csrf(); return result; };
    return { jar, cookie, request, csrf, login, token: () => csrfToken };
  }
  return { app, base, config, frontend, names, user, users, mail, calls, jwt, browser, close: () => app.close() };
}

function assertPublicUser(body) {
  assert.equal(typeof body.user.id, 'string');
  for (const privateKey of ['accessToken', 'refreshToken', 'password', 'tokenVersion']) {
    assert.equal(privateKey in body, false, privateKey);
    assert.equal(privateKey in body.user, false, `user.${privateKey}`);
  }
}

function assertCookieFlags(headers, names, secure) {
  for (const name of names) {
    const cookie = headers.find((header) => header.startsWith(`${name}=`));
    assert.ok(cookie, `Set-Cookie ${name}`);
    assert.match(cookie, /; HttpOnly(?:;|$)/i);
    assert.match(cookie, /; SameSite=Lax(?:;|$)/i);
    assert.match(cookie, /; Path=\/(?:;|$)/i);
    assert.equal(/; Secure(?:;|$)/i.test(cookie), secure);
    assert.doesNotMatch(cookie, /; Domain=/i);
    assert.match(cookie, /; Max-Age=[1-9]\d*/i);
  }
}

test('HTTP login/register expose only public users and issue HttpOnly host-only cookies', async () => {
  const f = await fixture();
  try {
    const b = f.browser();
    const bootstrap = await b.csrf();
    assert.equal(bootstrap.headers.get('cache-control'), 'no-store');
    const oldCsrf = b.token();
    const oldNonce = b.jar.get(f.names.csrf);
    const login = await b.request('/auth/login', { method: 'POST', body: { email: f.user.email, password: 'Initial!!12' } });
    assert.equal(login.status, 201);
    assertPublicUser(login.body);
    assertCookieFlags(login.setCookies, Object.values(f.names), false);
    assert.equal(login.headers.get('cache-control'), 'no-store');
    assert.notEqual(b.jar.get(f.names.csrf), oldNonce);
    assert.equal((await b.request('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': oldCsrf } })).status, 403);
    assert.equal((await b.request('/auth/me')).status, 200);
    await b.csrf();
    const registered = await b.request('/auth/register', { method: 'POST', body: { name: 'New user', email: 'new@example.invalid', password: 'Register!!12' } });
    assert.equal(registered.status, 201);
    assertPublicUser(registered.body);
    assertCookieFlags(registered.setCookies, Object.values(f.names), false);
  } finally { await f.close(); }
});

test('production session and CSRF cookies use Secure __Host- names without Domain', async () => {
  const f = await fixture(true);
  try {
    const b = f.browser();
    const login = await b.login();
    assert.deepEqual(Object.values(f.names), ['__Host-pl-access', '__Host-pl-refresh', '__Host-pl-csrf']);
    assertCookieFlags(login.setCookies, Object.values(f.names), true);
  } finally { await f.close(); }
});

test('CSRF blocks every unsafe route with missing, null, suffix-spoofed or foreign Origin', async () => {
  const f = await fixture();
  try {
    const b = f.browser(); await b.login();
    const routes = [
      ['POST', '/auth/login'], ['POST', '/auth/register'], ['POST', '/auth/refresh'], ['POST', '/auth/logout'],
      ['POST', '/auth/change-password'], ['POST', '/auth/forgot-password'], ['POST', '/auth/reset-password'],
      ['POST', '/evidence/attempt/uploads'], ['PUT', '/evidence/uploads/upload/chunks/0'],
      ['POST', '/evidence/uploads/upload/complete'], ['POST', '/evidence/uploads/upload/abort'],
    ];
    for (const [method, path] of routes) for (const origin of [undefined, 'null', 'http://localhost:3000.attacker.invalid', 'https://attacker.invalid']) {
      const result = await b.request(path, { method, body: {}, headers: { Origin: origin } });
      assert.equal(result.status, 403, `${method} ${path}: ${origin}`);
      assert.equal(result.body.code, 'ORIGIN_INVALID');
    }
    assert.equal(f.calls.uploadAuthorize, 0);
    assert.equal(f.calls.uploadWrite, 0);
    assert.equal((await b.request('/auth/csrf', { headers: { Origin: 'https://attacker.invalid' } })).status, 403);
  } finally { await f.close(); }
});

test('CSRF tokens are required, signed, session-bound and cannot be copied between browsers', async () => {
  const f = await fixture();
  try {
    const a = f.browser(), b = f.browser(); await a.csrf(); await b.csrf();
    for (const token of [undefined, 'invented', `${a.token().slice(0, -1)}${a.token().endsWith('a') ? 'b' : 'a'}`, b.token()]) {
      const result = await a.request('/auth/login', { method: 'POST', body: { email: f.user.email, password: 'Initial!!12' }, headers: { 'X-CSRF-Token': token } });
      assert.equal(result.status, 403);
      assert.equal(result.body.code, 'CSRF_INVALID');
    }
    assert.equal(f.user.refreshToken, null);
  } finally { await f.close(); }
});

test('CSRF rejects multipart before the upload guard, Multer disk write or storage call', async () => {
  const f = await fixture();
  try {
    const b = f.browser(); await b.login();
    const before = (await readdir(RECORDING_DIRECTORY)).sort();
    const data = new FormData(); data.append('file', new Blob(['chunk'], { type: 'video/webm' }), 'chunk.webm');
    const denied = await b.request('/evidence/uploads/upload/chunks/0', { method: 'PUT', body: data, headers: { 'X-CSRF-Token': undefined } });
    assert.equal(denied.status, 403);
    assert.deepEqual((await readdir(RECORDING_DIRECTORY)).sort(), before);
    assert.equal(f.calls.uploadAuthorize, 0);
    assert.equal(f.calls.uploadWrite, 0);
    const accepted = await b.request('/evidence/uploads/upload/chunks/0', { method: 'PUT', body: data });
    assert.equal(accepted.status, 200);
    assert.equal(f.calls.uploadAuthorize, 1);
    assert.equal(f.calls.uploadWrite, 1);
    assert.deepEqual((await readdir(RECORDING_DIRECTORY)).sort(), before);
  } finally { await f.close(); }
});

test('REST requires an unexpired signed access cookie; Bearer, refresh and duplicate cookies fail', async () => {
  const f = await fixture();
  try {
    const b = f.browser(); await b.login();
    const access = b.jar.get(f.names.access);
    for (const headers of [
      { Cookie: undefined, Authorization: `Bearer ${access}` },
      { Cookie: `${f.names.access}=tampered` },
      { Cookie: `${f.names.access}=${b.jar.get(f.names.refresh)}` },
      { Cookie: `${f.names.access}=${access}; ${f.names.access}=${access}` },
      { Cookie: `${f.names.access}=${f.jwt.sign({ sub: f.user.id, ver: 0 }, { secret: f.config.get('JWT_ACCESS_SECRET'), expiresIn: -1 })}` },
    ]) assert.equal((await b.request('/auth/me', { headers })).status, 401);
    f.user.tokenVersion++;
    assert.equal((await b.request('/auth/me')).status, 401);
    assert.equal((await b.request('/auth/me')).headers.getSetCookie().length, 0);
  } finally { await f.close(); }
});

test('a mutation pinned to the previous account cannot replay under a new cookie identity', async () => {
  const f = await fixture();
  try {
    const b = f.browser(); await b.login();
    const originalActor = f.user.id;
    const changed = await b.request('/auth/register', { method: 'POST', body: { name: 'Second account', email: 'second@example.invalid', password: 'Second!!12' } });
    assert.equal(changed.status, 201);
    const newActor = changed.body.user.id;
    assert.notEqual(newActor, originalActor);
    await b.csrf(); // Simulate the automatic CSRF bootstrap after cookies changed in another tab.
    const cookiesBefore = b.cookie();
    const filesBefore = (await readdir(RECORDING_DIRECTORY)).sort();
    const data = new FormData(); data.append('file', new Blob(['chunk'], { type: 'video/webm' }), 'chunk.webm');
    const rejected = await b.request('/evidence/uploads/upload/chunks/0', { method: 'PUT', body: data, headers: { 'X-Session-User': originalActor } });
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.code, 'AUTH_CHANGED');
    assert.deepEqual(rejected.setCookies, []);
    assert.equal(b.cookie(), cookiesBefore);
    assert.equal(f.calls.uploadAuthorize, 0);
    assert.equal(f.calls.uploadWrite, 0);
    assert.deepEqual((await readdir(RECORDING_DIRECTORY)).sort(), filesBefore);
    assert.equal((await b.request('/auth/me')).body.id, newActor);
    const accepted = await b.request('/evidence/uploads/upload/chunks/0', { method: 'PUT', body: data, headers: { 'X-Session-User': newActor } });
    assert.equal(accepted.status, 200);
    assert.equal(f.calls.uploadWrite, 1);
    assert.deepEqual((await readdir(RECORDING_DIRECTORY)).sort(), filesBefore);
  } finally { await f.close(); }
});

test('HTTP refresh rotates cookies once; losing concurrent/stale requests cannot clear the winning session', async () => {
  const f = await fixture();
  try {
    const b = f.browser(); await b.login();
    const oldCookie = b.cookie(), oldRefresh = b.jar.get(f.names.refresh), nonce = b.jar.get(f.names.csrf);
    const responses = await Promise.all([1, 2].map(() => b.request('/auth/refresh', { method: 'POST', body: {}, headers: { Cookie: oldCookie }, applyCookies: false })));
    const success = responses.find((r) => r.status === 201), rejected = responses.find((r) => r.status === 401);
    assert.ok(success); assert.ok(rejected);
    assert.deepEqual(success.body, { ok: true });
    assert.deepEqual(rejected.setCookies, []);
    assertCookieFlags(success.setCookies, [f.names.access, f.names.refresh], false);
    for (const header of success.setCookies) { const pair = header.split(';')[0]; b.jar.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)); }
    assert.notEqual(b.jar.get(f.names.refresh), oldRefresh);
    assert.equal(b.jar.get(f.names.csrf), nonce);
    const stale = await b.request('/auth/refresh', { method: 'POST', body: {}, headers: { Cookie: oldCookie } });
    assert.equal(stale.status, 401); assert.deepEqual(stale.setCookies, []);
    assert.equal((await b.request('/auth/me')).status, 200);
    assert.equal((await b.request('/auth/refresh', { method: 'POST', body: { refreshToken: oldRefresh } })).status, 400);
    assert.equal((await b.request('/auth/refresh', { method: 'POST', body: {} })).status, 201);
  } finally { await f.close(); }
});

test('logout and password change clear all browser cookies and revoke prior REST and refresh credentials', async () => {
  for (const operation of ['logout', 'change-password']) {
    const f = await fixture();
    try {
      const b = f.browser(); await b.login(); const oldCookie = b.cookie();
      const result = await b.request(`/auth/${operation}`, { method: 'POST', body: operation === 'change-password' ? { currentPassword: 'Initial!!12', newPassword: 'Changed!!34' } : {} });
      assert.equal(result.status, 201);
      assert.equal(b.jar.size, 0);
      for (const name of Object.values(f.names)) assert.match(result.setCookies.find((header) => header.startsWith(`${name}=`)), /Expires=Thu, 01 Jan 1970/i);
      assert.equal((await b.request('/auth/me', { headers: { Cookie: oldCookie } })).status, 401);
      assert.equal((await b.request('/auth/refresh', { method: 'POST', body: {}, headers: { Cookie: oldCookie } })).status, 401);
      assert.equal(f.user.tokenVersion, 1);
    } finally { await f.close(); }
  }
});

test('password reset requires CSRF, enforces password policy, is single-use and revokes old sessions', async () => {
  const f = await fixture();
  try {
    const b = f.browser(); await b.login(); const oldCookie = b.cookie();
    assert.equal((await b.request('/auth/forgot-password', { method: 'POST', body: { email: f.user.email } })).status, 201);
    assert.ok(f.mail.resetToken);
    assert.equal((await b.request('/auth/reset-password', { method: 'POST', body: { token: f.mail.resetToken, newPassword: 'weakpassword' } })).status, 400);
    assert.equal((await b.request('/auth/reset-password', { method: 'POST', body: { token: f.mail.resetToken, newPassword: 'Reset!!34' } })).status, 201);
    assert.equal(b.jar.size, 0);
    assert.equal((await b.request('/auth/me', { headers: { Cookie: oldCookie } })).status, 401);
    await b.csrf();
    assert.equal((await b.request('/auth/reset-password', { method: 'POST', body: { token: f.mail.resetToken, newPassword: 'Again!!56' } })).status, 400);
  } finally { await f.close(); }
});

function socketClient(f, headers, auth = {}) {
  const socket = new WebSocket(`${f.base.replace('http:', 'ws:')}/socket.io/?EIO=4&transport=websocket`, { headers });
  const bus = new EventEmitter(), events = [];
  const emit = (event, data) => { events.push({ event, data }); bus.emit(event, data); };
  socket.on('error', (error) => emit('transport:error', error));
  socket.on('close', () => emit('close'));
  socket.on('message', (data) => {
    const packet = String(data);
    if (packet.startsWith('0')) socket.send(`40/proctor,${JSON.stringify(auth)}`);
    else if (packet === '2') socket.send('3');
    else if (packet.startsWith('40/proctor,')) emit('ready');
    else if (packet.startsWith('42/proctor,')) { const [event, body] = JSON.parse(packet.slice('42/proctor,'.length)); emit(event, body); }
  });
  const next = (event) => new Promise((resolve, reject) => {
    const old = events.findIndex((entry) => entry.event === event);
    if (old !== -1) return resolve(events.splice(old, 1)[0].data);
    const timer = setTimeout(() => { bus.off(event, done); reject(new Error(`Socket timeout: ${event}`)); }, 2500);
    const done = (data) => { clearTimeout(timer); const index = events.findIndex((entry) => entry.event === event); if (index !== -1) events.splice(index, 1); resolve(data); };
    bus.once(event, done);
  });
  const close = async () => { if (socket.readyState === WebSocket.CLOSED) return; const completed = next('close'); socket.terminate(); await completed; };
  return { socket, next, close, send: (event, data) => socket.send(`42/proctor,${JSON.stringify([event, data])}`) };
}

test('real WebSocket upgrade denies absent/null/foreign Origins even with valid cookies', async () => {
  const f = await fixture();
  try {
    const b = f.browser(); await b.login();
    for (const origin of [undefined, 'null', 'https://attacker.invalid', 'http://localhost:3000.attacker.invalid']) {
      const client = socketClient(f, { Cookie: b.cookie(), ...(origin ? { Origin: origin } : {}) });
      try { assert.match((await client.next('transport:error')).message, /Unexpected server response: (400|403)/); }
      finally { await client.close(); }
    }
    assert.equal(f.calls.socketAccess, 0);
  } finally { await f.close(); }
});

test('WebSocket ignores auth.token and rejects expired, tampered and revoked cookie JWTs', async () => {
  const f = await fixture();
  try {
    const b = f.browser(); await b.login(); const access = b.jar.get(f.names.access);
    for (const [cookie, auth] of [
      [undefined, { token: access }], [`${f.names.access}=tampered`, {}],
      [`${f.names.access}=${f.jwt.sign({ sub: f.user.id, ver: 0 }, { secret: f.config.get('JWT_ACCESS_SECRET'), expiresIn: -1 })}`, {}],
      [`${f.names.access}=${f.jwt.sign({ sub: f.user.id, ver: -1 }, { secret: f.config.get('JWT_ACCESS_SECRET'), expiresIn: '5m' })}`, {}],
    ]) {
      const client = socketClient(f, { Origin: f.frontend, ...(cookie ? { Cookie: cookie } : {}) }, auth);
      try { assert.equal((await client.next('proctor:error')).code, 'UNAUTHORIZED'); }
      finally { await client.close(); }
    }
    assert.equal(f.calls.socketAccess, 0);
  } finally { await f.close(); }
});

test('connected WebSockets re-check DB tokenVersion, user existence and role before every event', async () => {
  for (const change of ['revoke', 'delete', 'role']) {
    const f = await fixture(); let client;
    try {
      const b = f.browser(); await b.login();
      client = socketClient(f, { Origin: f.frontend, Cookie: b.cookie() }); await client.next('ready');
      client.send('proctor:start', { attemptId: 'attempt', role: 'student' }); await client.next('proctor:started');
      if (change === 'revoke') f.user.tokenVersion++;
      else if (change === 'delete') f.users.delete(f.user.id);
      else f.user.role = 'PROCTOR';
      client.send('proctor:event', { attemptId: 'attempt', type: 'tab_switch' });
      assert.equal((await client.next('proctor:error')).code, 'UNAUTHORIZED');
      assert.equal(f.calls.socketEvents, 0);
    } finally { if (client) await client.close(); await f.close(); }
  }
});
