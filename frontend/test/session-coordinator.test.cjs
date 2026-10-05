const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '../src', relative);
  const target = new Module(filename, module); target.paths = module.paths;
  const original = target.require.bind(target); target.require = (name) => mocks[name] ?? original(name);
  target._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return target.exports;
}
const coordinator = load('lib/session-coordinator.ts');
const { SessionCoordinator, CsrfCoordinator } = coordinator;
const { analyzePassword } = load('lib/password-policy.ts');
const failure = (status, code) => ({ response: { status, data: { code } } });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const defer = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function serialLock() { let pending = Promise.resolve(); return (operation) => { const next = pending.then(operation); pending = next.catch(() => {}); return next; }; }

test('parallel 401s share one refresh and every subsequent request observes the new generation', async () => {
  const gate = defer(); let live = false; let refreshes = 0;
  const session = new SessionCoordinator(async () => { if (!live) throw failure(401); return { id: 'student' }; }, async () => { refreshes++; await gate.promise; live = true; }, serialLock());
  const requests = Array.from({ length: 12 }, () => session.recover(0)); await tick(); gate.resolve(); await Promise.all(requests);
  assert.equal(refreshes, 1); assert.equal(session.generation, 1); assert.equal(session.principal, 'student');
});

test('two tabs recheck cookies inside their shared lock so only the first tab rotates refresh', async () => {
  const lock = serialLock(); let live = false; let refreshes = 0;
  const check = async () => { if (!live) throw failure(401); return { id: 'student' }; };
  const refresh = async () => { refreshes++; await tick(); live = true; };
  const a = new SessionCoordinator(check, refresh, lock); const b = new SessionCoordinator(check, refresh, lock);
  await Promise.all([a.recover(0), b.recover(0)]); assert.equal(refreshes, 1);
});

test('a late old 401 verifies the current cookies without a second rotation', async () => {
  let live = false; let refreshes = 0;
  const session = new SessionCoordinator(async () => { if (!live) throw failure(401); return { id: 'student' }; }, async () => { refreshes++; live = true; }, serialLock());
  await session.recover(0); await session.recover(0); assert.equal(refreshes, 1);
});

test('network and 503 failures do not rotate or advance the session and the next retry can recover', async () => {
  let broken = true; let refreshes = 0;
  const session = new SessionCoordinator(async () => { if (broken) throw failure(503); return { id: 'student' }; }, async () => { refreshes++; }, serialLock());
  await assert.rejects(session.recover(0)); assert.equal(refreshes, 0); assert.equal(session.generation, 0);
  broken = false; await session.recover(0); assert.equal(session.generation, 1);
});

test('an expired refresh rejects without an unbounded retry', async () => {
  let refreshes = 0;
  const session = new SessionCoordinator(async () => { throw failure(401); }, async () => { refreshes++; throw failure(401); }, serialLock());
  await assert.rejects(session.recover(0)); assert.equal(refreshes, 1); assert.equal(session.generation, 0);
});

test('logout waits for an in-flight refresh, then changes identity so old mutations cannot replay', async () => {
  const gate = defer(); const events = []; let live = false;
  const session = new SessionCoordinator(async () => { if (!live) throw failure(401); return { id: 'A' }; }, async () => { await gate.promise; live = true; events.push('refresh'); }, serialLock());
  const refresh = session.recover(0); await tick(); const logout = session.mutate(async () => { events.push('logout'); live = false; });
  gate.resolve(); await Promise.all([refresh, logout]); assert.deepEqual(events, ['refresh', 'logout']);
  assert.throws(() => session.recover(0, 0), { code: 'AUTH_CHANGED' });
});

test('an account change before a queued authenticated mutation prevents its execution', async () => {
  const gate = defer(); const lock = serialLock(); let mutations = 0;
  const session = new SessionCoordinator(async () => ({ id: 'B' }), async () => {}, lock);
  const held = lock(() => gate.promise); const mutation = session.mutate(async () => { mutations++; }, true);
  session.changed(true); gate.resolve(); await held; await assert.rejects(mutation, { code: 'AUTH_CHANGED' }); assert.equal(mutations, 0);
});

test('a delayed broadcast cannot replay A requests after raw me already reports B', async () => {
  const session = new SessionCoordinator(async () => ({ id: 'B' }), async () => {}, serialLock()); session.setPrincipal('A');
  await assert.rejects(session.recover(0), { code: 'AUTH_CHANGED', rebootstrap: true });
  assert.equal(session.principal, 'B'); assert.equal(session.identity, 1);
});

test('a changed identity discovered after refresh is rejected before an authenticated mutation', async () => {
  let live = false; let mutations = 0;
  const session = new SessionCoordinator(async () => { if (!live) throw failure(401); return { id: 'B' }; }, async () => { live = true; }, serialLock()); session.setPrincipal('A');
  await assert.rejects(session.mutate(async () => { mutations++; }, true), { code: 'AUTH_CHANGED' }); assert.equal(mutations, 0);
});

test('parallel CSRF bootstraps and stale rejections share the replacement token', async () => {
  let calls = 0; const gate = defer();
  const csrf = new CsrfCoordinator(async () => { calls++; if (calls === 2) await gate.promise; return `csrf-${calls}`; });
  assert.deepEqual(await Promise.all([csrf.get(), csrf.get()]), ['csrf-1', 'csrf-1']);
  csrf.invalidate('csrf-1'); const a = csrf.get(); csrf.invalidate('csrf-1'); const b = csrf.get(); gate.resolve();
  assert.deepEqual(await Promise.all([a, b]), ['csrf-2', 'csrf-2']); assert.equal(calls, 2);
});

test('CSRF_INVALID retries once; Origin rejection and repeated failure do not loop', async () => {
  let bootstraps = 0; let requests = 0; const csrf = new CsrfCoordinator(async () => `token-${++bootstraps}`);
  await assert.rejects(csrf.run(async () => { requests++; throw failure(403, 'CSRF_INVALID'); }));
  assert.equal(requests, 2); assert.equal(bootstraps, 2);
  requests = 0; await assert.rejects(csrf.run(async () => { requests++; throw failure(403, 'ORIGIN_INVALID'); })); assert.equal(requests, 1);
});

test('the shared password policy rejects bcrypt-truncated Unicode and accepts the server special-character set', () => {
  assert.equal(analyzePassword('Pass!!12').valid, true); assert.equal(analyzePassword('Pass\\\\12').valid, true);
  assert.equal(analyzePassword('ә'.repeat(34) + '!!12').valid, true); assert.equal(analyzePassword('ә'.repeat(35) + '!!12').valid, false);
  assert.equal(analyzePassword('P!!12').valid, false); assert.equal(analyzePassword('Pass!!12\n').valid, false);
});

function storeFixture(get, mutation = async () => ({ data: { user: { id: 'B', role: 'STUDENT' } } })) {
  let listener;
  const api = { default: { get }, authMutation: mutation, clearLegacyAuth() {}, onAuthEvent(value) { listener = value; } };
  const chat = load('store/chat.store.ts', { '@/lib/api': api });
  const { useAuthStore } = load('store/auth.store.ts', { './chat.store': chat, '@/lib/api': api, '@/lib/session-coordinator': coordinator });
  return { store: useAuthStore, event: (name) => listener(name) };
}

test('a bootstrap network failure preserves the authenticated user and exposes retry state', async () => {
  const f = storeFixture(async () => { throw failure(503); }); f.store.getState().setUser({ id: 'A', role: 'STUDENT' });
  await f.store.getState().fetchMe(); assert.equal(f.store.getState().user.id, 'A'); assert.ok(f.store.getState().error); assert.equal(f.store.getState().isLoading, false);
});

test('a stale me response cannot overwrite the user accepted by a newer login', async () => {
  const gate = defer(); const f = storeFixture(() => gate.promise);
  const bootstrap = f.store.getState().fetchMe(); await f.store.getState().login('email', 'password');
  gate.resolve({ data: { id: 'A' } }); await bootstrap; assert.equal(f.store.getState().user.id, 'B');
});

test('logout calls the server even with no cached user and failed logout retains an existing session', async () => {
  let calls = 0; const f = storeFixture(async () => ({}), async () => { calls++; throw failure(503); });
  await assert.rejects(f.store.getState().logout()); assert.equal(calls, 1);
  f.store.getState().setUser({ id: 'A' }); await assert.rejects(f.store.getState().logout()); assert.equal(f.store.getState().user.id, 'A');
});

function apiFixture(context, handle) {
  const axios = require('axios'); const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const lock = serialLock();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: (_, operation) => lock(operation) } } });
  context.after(() => { if (previous) Object.defineProperty(globalThis, 'navigator', previous); else delete globalThis.navigator; });
  const response = (config, data, status = 200) => ({ config, data, status, statusText: '', headers: {} });
  const reject = (config, status, code) => { throw new axios.AxiosError(code, undefined, config, {}, response(config, { code }, status)); };
  let user = 'A';
  const client = load('lib/api.ts', {
    './session-coordinator': coordinator,
    axios: { default: { create: (options) => axios.create({ ...options, adapter: async (config) => {
      if (config.url === '/auth/csrf') return response(config, { csrfToken: 'csrf' });
      if (config.url === '/auth/login') { user = JSON.parse(config.data).email; return response(config, { user: { id: user } }); }
      if (config.url === '/auth/me') return response(config, { id: user });
      return handle(config, { response, reject });
    } }) } },
  });
  return { ...client, switchCookies: (id) => { user = id; } };
}

test('Axios does not replay an old mutation when identity changes while its first response is pending', async (context) => {
  const gate = defer(); let requests = 0;
  const client = apiFixture(context, async (config, { reject }) => {
    requests++; assert.equal(config.headers.get('X-Session-User'), 'A'); await gate.promise; return reject(config, 401, 'UNAUTHORIZED');
  });
  await client.authMutation('/auth/login', { email: 'A' });
  const mutation = client.api.patch('/resource', { value: 'old A data' }); await tick();
  await client.authMutation('/auth/login', { email: 'B' }); gate.resolve();
  await assert.rejects(mutation, { code: 'AUTH_CHANGED' }); assert.equal(requests, 1);
});

test('Axios pins the actor and refuses a CSRF retry if cookies switched before a delayed broadcast arrived', async (context) => {
  let requests = 0; let changed = 0;
  const client = apiFixture(context, async (config, { reject }) => {
    requests++; assert.equal(config.headers.get('X-Session-User'), 'A'); return reject(config, 403, 'CSRF_INVALID');
  });
  client.onAuthEvent((event) => { if (event === 'changed') changed++; });
  await client.authMutation('/auth/login', { email: 'A' }); client.switchCookies('B');
  await assert.rejects(client.api.patch('/resource', { value: 'A data' }), { code: 'AUTH_CHANGED' });
  assert.equal(requests, 1); assert.equal(changed, 1);
});
