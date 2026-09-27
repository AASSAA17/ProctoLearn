const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(name) { const filename = path.resolve(__dirname, `../src/lib/${name}.ts`); const out = new Module(filename, module); out._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename); return out.exports; }
const { DurableRecording } = load('durable-recording');
const { recordingBudget, RECORDING_LIMIT } = load('recording-budget');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const defer = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  const session = { id: 'local', ownerId: 'student', examId: 'exam', attemptId: 'attempt', kind: 'camera', mimeType: 'video/webm', state: 'recording', interrupted: false, nextIndex: 0, totalBytes: 0, uploadId: null, createdAt: 1, updatedAt: 1 };
  const chunks = new Map(); const remote = new Map(); const events = []; const states = []; const pressure = [];
  let remoteState = 'OPEN'; let expectedChunks = null; let interrupted = false;
  const manifest = () => ({ id: 'server', attemptId: 'attempt', kind: 'camera', clientSessionId: 'local', mimeType: 'video/webm', state: remoteState, bytes: [...remote.values()].reduce((sum, blob) => sum + blob.size, 0), expectedChunks, interrupted, evidenceId: remoteState === 'COMPLETE' ? 'evidence' : null, expiresAt: '', chunks: [...remote].map(([index, blob]) => ({ index, size: blob.size, sha256: 'hash' })) });
  const store = {
    get: async () => ({ ...session }), list: async () => [{ ...session }], create: async () => {},
    update: async (_, patch) => { Object.assign(session, patch, { interrupted: session.interrupted || patch.interrupted === true, state: session.state === 'complete' ? 'complete' : patch.state ?? session.state }); return { ...session }; },
    append: async (_, blob) => { chunks.set(session.nextIndex, { index: session.nextIndex, sessionId: 'local', blob, size: blob.size, sent: 0 }); events.push(['persist', session.nextIndex]); session.nextIndex++; session.totalBytes += blob.size; },
    nextUnsent: async () => [...chunks.values()].find((chunk) => !chunk.sent) ?? null,
    markSent: async (_, index) => { chunks.get(index).sent = 1; },
    complete: async () => { events.push(['cleanup']); session.state = 'complete'; chunks.clear(); },
  };
  const transport = {
    init: async () => manifest(), get: async () => manifest(),
    put: async (_, index, blob) => { assert.ok(chunks.has(index)); events.push(['upload', index]); remote.set(index, blob); return manifest(); },
    finish: async (_, count, wasInterrupted) => { assert.equal(count, remote.size); events.push(['finalize']); expectedChunks = count; interrupted = wasInterrupted; remoteState = 'COMPLETE'; return manifest(); },
  };
  const make = () => new DurableRecording('local', store, transport, (state) => states.push(state), (paused) => pressure.push(paused), 4);
  return { session, chunks, remote, events, states, pressure, store, transport, manifest, make };
}

test('persist precedes transport, large blobs split in order, and local bytes survive until final acknowledgement', async () => {
  const f = fixture(); const writer = f.make();
  await writer.append(new Blob(['abcdefghij'])); await writer.finish();
  assert.deepEqual([...f.remote.values()].map((blob) => blob.size), [4, 4, 2]);
  assert.equal(await new Blob([...f.remote.values()]).text(), 'abcdefghij');
  assert.deepEqual(f.events.slice(-2), [['finalize'], ['cleanup']]);
  assert.equal(f.chunks.size, 0); writer.dispose();
});

test('lost chunk response retries identical bytes at the same index, without dropping local data', async () => {
  const f = fixture(); const writer = f.make(); const put = f.transport.put; let first = true;
  f.transport.put = async (...args) => { const answer = await put(...args); if (first) { first = false; throw new Error('offline after write'); } return answer; };
  await writer.append(new Blob(['abcdefgh'])); await tick();
  assert.equal(writer.state.status, 'offline'); assert.equal(f.chunks.size, 2);
  await writer.finish(); assert.equal(await new Blob([...f.remote.values()]).text(), 'abcdefgh');
  assert.equal(f.events.filter(([kind, index]) => kind === 'upload' && index === 0).length, 2); writer.dispose();
});

test('reload resumes persisted chunks and marks an interrupted recorder session without concatenating a new capture', async () => {
  const f = fixture(); let writer = f.make(); const finish = f.transport.finish;
  f.transport.finish = async () => { throw new Error('offline'); };
  await writer.append(new Blob(['old stream'])); await assert.rejects(writer.finish(), /offline/);
  assert.equal(f.session.state, 'pending'); assert.ok(f.chunks.size); writer.dispose();
  f.transport.finish = finish; writer = f.make(); await writer.finish(true);
  assert.equal(f.manifest().interrupted, true); assert.equal(f.manifest().state, 'COMPLETE'); writer.dispose();
});

test('a lost finalize response is recovered from the manifest with no second upload or premature cleanup', async () => {
  const f = fixture(); let writer = f.make(); const finish = f.transport.finish;
  f.transport.finish = async (...args) => { await finish(...args); throw new Error('response lost'); };
  await writer.append(new Blob(['capture'])); await assert.rejects(writer.finish(), /response lost/);
  assert.ok(f.chunks.size); const sent = f.events.filter(([kind]) => kind === 'upload').length; writer.dispose();
  writer = f.make(); await writer.finish(); assert.equal(f.chunks.size, 0);
  assert.equal(f.events.filter(([kind]) => kind === 'upload').length, sent); writer.dispose();
});

test('IndexedDB failure retains the unsaved suffix and resumes without duplication after storage recovery', async () => {
  const f = fixture(); const writer = f.make(); const append = f.store.append; let fail = true;
  f.store.append = async (...args) => { if (f.session.nextIndex === 1 && fail) throw new Error('quota'); return append(...args); };
  await assert.rejects(writer.append(new Blob(['abcdefghij'])), /quota/);
  assert.equal(writer.bufferedBytes, 6); assert.equal(f.pressure.at(-1), true);
  fail = false; await writer.finish(true);
  assert.equal(await new Blob([...f.remote.values()]).text(), 'abcdefghij'); assert.equal(writer.bufferedBytes, 0); assert.equal(f.pressure.at(-1), false); writer.dispose();
});

test('uploads remain serialized as new data and concurrent finalization arrive during a slow network request', async () => {
  const f = fixture(); const writer = f.make(); const put = f.transport.put; const gate = defer(); let active = 0; let maxActive = 0;
  f.transport.put = async (...args) => { active++; maxActive = Math.max(active, maxActive); if (!args[1]) await gate.promise; const answer = await put(...args); active--; return answer; };
  await writer.append(new Blob(['abcd'])); await tick(); await writer.append(new Blob(['efgh']));
  const a = writer.finish(); const b = writer.finish(); gate.resolve(); await Promise.all([a, b]);
  assert.equal(maxActive, 1); assert.equal(f.events.filter(([kind]) => kind === 'finalize').length, 1); assert.equal(f.session.state, 'complete'); writer.dispose();
});

test('permanent chunk conflicts remain visible and never erase retained evidence', async () => {
  const f = fixture(); const writer = f.make();
  f.transport.put = async () => { throw { response: { status: 409, data: { code: 'CHUNK_CONFLICT', message: 'conflict' } } }; };
  await writer.append(new Blob(['bytes'])); await tick(); await assert.rejects(writer.finish(), /conflict/);
  assert.equal(writer.state.status, 'error'); assert.ok(f.chunks.size); assert.equal(f.events.some(([kind]) => kind === 'cleanup'), false); writer.dispose();
});

test('server completion with mismatched byte/chunk manifest does not discard local content', async () => {
  const f = fixture(); const writer = f.make(); const finish = f.transport.finish;
  f.transport.finish = async (...args) => ({ ...await finish(...args), bytes: 1 });
  await writer.append(new Blob(['recording'])); await assert.rejects(writer.finish()); assert.ok(f.chunks.size); writer.dispose();
});

test('a finalization request joining the last upload wake-up still waits until the COMPLETE acknowledgement', async () => {
  const f = fixture(); const writer = f.make();
  const read = f.store.get; let calls = 0; const gate = defer();
  f.store.get = async (...args) => { calls++; if (calls === 3) await gate.promise; return read(...args); };
  await writer.append(new Blob(['abcd'])); await tick();
  const finished = writer.finish(); gate.resolve(); await finished;
  assert.equal(f.session.state, 'complete'); writer.dispose();
});

test('capture budget supports one hour, refuses excessive durations and honors existing/available bytes', () => {
  assert.ok(recordingBudget(60 * 60).estimatedBytes < RECORDING_LIMIT);
  assert.throws(() => recordingBudget(24 * 60 * 60), /512/);
  assert.throws(() => recordingBudget(60 * 60, 100 * 1024 * 1024), /512/);
  assert.throws(() => recordingBudget(30 * 60, 0, 5 * 1024 * 1024), /Браузер/);
});

test('a crashed finalizer lease is reclaimed by retrying complete, preserving bytes while the lease is held', async () => {
  const f = fixture(); let writer = f.make();
  await writer.append(new Blob(['old capture'])); await tick(); writer.dispose();
  f.session.state = 'pending'; f.session.interrupted = true;
  const init = f.transport.init; const finish = f.transport.finish; let locked = true; let completes = 0;
  f.transport.init = async (...args) => ({ ...await init(...args), state: 'FINALIZING' });
  f.transport.finish = async (...args) => {
    completes++;
    if (locked) throw { response: { status: 409, data: { code: 'UPLOAD_FINALIZING' } } };
    return finish(...args);
  };
  writer = f.make(); await assert.rejects(writer.finish());
  assert.equal(completes, 1); assert.equal(writer.state.code, 'UPLOAD_FINALIZING'); assert.ok(f.chunks.size);
  locked = false; await writer.finish();
  assert.equal(completes, 2); assert.equal(f.session.state, 'complete'); assert.equal(f.manifest().interrupted, true); writer.dispose();
});

test('server-aborted sessions expose an explicit recovery action and retain every local chunk', async () => {
  const f = fixture(); const writer = f.make();
  f.transport.init = async () => ({ ...f.manifest(), state: 'ABORTED' });
  await writer.append(new Blob(['retained evidence'])); await assert.rejects(writer.finish());
  assert.equal(writer.state.status, 'error'); assert.equal(writer.state.code, 'UPLOAD_ABORTED');
  assert.equal(await new Blob([...f.chunks.values()].map(({ blob }) => blob)).text(), 'retained evidence');
  assert.equal(f.events.some(([kind]) => kind === 'cleanup'), false); writer.dispose();
});

test('recovery renews existing sessions with idempotent init and refuses an unexpected upload identity', async () => {
  const f = fixture(); const writer = f.make();
  f.session.uploadId = 'old-server';
  let renewed = 0;
  f.transport.init = async () => { renewed++; return f.manifest(); };
  await writer.append(new Blob(['bytes'])); await assert.rejects(writer.finish());
  assert.ok(renewed); assert.equal(writer.state.status, 'error'); assert.ok(f.chunks.size);
  assert.equal(f.events.some(([kind]) => kind === 'upload'), false); writer.dispose();
});
