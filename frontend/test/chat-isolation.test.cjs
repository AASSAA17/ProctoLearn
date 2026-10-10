const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(relative, mocks) {
  const filename = path.resolve(__dirname, '../src', relative);
  const target = new Module(filename, module); target.paths = module.paths;
  const original = target.require.bind(target); target.require = (name) => mocks[name] ?? original(name);
  target._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return target.exports;
}
function fixture() {
  const calls = []; let event;
  const api = { post: (url, body, config) => new Promise((resolve, reject) => calls.push({ url, body, config, resolve, reject })), get: async () => ({ data: { id: 'B' } }) };
  const chat = load('store/chat.store.ts', { '@/lib/api': { default: api } }).useChatStore;
  const auth = load('store/auth.store.ts', { './chat.store': { useChatStore: chat }, '@/lib/api': { default: api, clearLegacyAuth() {}, onAuthEvent(fn) { event = fn; }, authMutation: async (url) => ({ data: { user: { id: url === '/auth/register' ? 'C' : 'B' } } }) }, '@/lib/session-coordinator': { isUnauthorized: () => true } }).useAuthStore;
  return { chat, auth, calls, event: (value) => event(value) };
}

test('SPA account transitions reset messages, course, loading and panel before new history is sent', async () => {
  const f = fixture(); f.auth.getState().setUser({ id: 'A' });
  f.chat.getState().addMessage({ role: 'user', content: 'private A' });
  f.chat.getState().setCourseId('private-course'); f.chat.getState().openChat();
  await f.auth.getState().logout();
  assert.deepEqual(f.chat.getState().messages, []); assert.equal(f.chat.getState().courseId, undefined); assert.equal(f.chat.getState().isOpen, false);
  await f.auth.getState().login('B', 'password');
  const pending = f.chat.getState().sendMessage('hello B', f.chat.getState().sessionVersion);
  assert.deepEqual(f.calls[0].body.history, []); assert.equal(f.calls[0].config.headers['X-Session-User'], 'B');
  f.calls[0].resolve({ data: { reply: 'reply B' } }); await pending;
  assert.deepEqual(f.chat.getState().messages.map(m => m.content), ['hello B', 'reply B']);
  await f.auth.getState().register('C', 'C', 'password'); assert.deepEqual(f.chat.getState().messages, []);
});

test('late success/error/finally and stale handlers cannot affect a replacement session, including A to B to A', async () => {
  for (const fail of [false, true]) {
    const f = fixture(); f.auth.getState().setUser({ id: 'A' });
    const oldVersion = f.chat.getState().sessionVersion;
    const old = f.chat.getState().sendMessage('old', oldVersion);
    assert.equal(f.calls[0].config.timeout, 125000);
    assert.equal(f.calls[0].config.signal.aborted, false);
    f.auth.getState().setUser({ id: 'B' }); f.auth.getState().setUser({ id: 'A' });
    assert.equal(f.calls[0].config.signal.aborted, true);
    await f.chat.getState().sendMessage('stale handler', oldVersion); assert.equal(f.calls.length, 1);
    const current = f.chat.getState().sendMessage('current', f.chat.getState().sessionVersion);
    if (fail) f.calls[0].reject(new Error('failed')); else f.calls[0].resolve({ data: { reply: 'private old' } });
    await old; assert.equal(f.chat.getState().isLoading, true); assert.deepEqual(f.chat.getState().messages.map(m => m.content), ['current']);
    f.calls[1].resolve({ data: { reply: 'current reply' } }); await current;
  }
});

test('cross-tab changes and expiry immediately erase chat and invalidate outstanding replies', async () => {
  for (const event of ['changed', 'expired']) {
    const f = fixture(); f.auth.getState().setUser({ id: 'A' });
    const pending = f.chat.getState().sendMessage('secret A', f.chat.getState().sessionVersion);
    f.event(event); assert.deepEqual(f.chat.getState().messages, []); assert.equal(f.chat.getState().ownerId, null);
    assert.equal(f.calls[0].config.signal.aborted, true);
    f.calls[0].resolve({ data: { reply: 'late' } }); await pending;
    assert.deepEqual(f.chat.getState().messages, []);
  }
});
