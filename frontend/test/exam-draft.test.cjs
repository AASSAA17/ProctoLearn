const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const sourcePath = path.resolve(__dirname, '../src/lib/exam-draft.ts');
const compiled = new Module(sourcePath, module);
compiled._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, sourcePath);
const { ExamDraftSaver, answerList, answerMap } = compiled.exports;
const empty = { answers: [], revision: 0, updatedAt: null };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const turn = () => new Promise((resolve) => setImmediate(resolve));

function fixture(draft = empty) {
  const calls = [];
  const states = [];
  const saver = new ExamDraftSaver(draft, (input, signal) => {
    const waiting = deferred();
    calls.push({ input, signal, ...waiting });
    return waiting.promise;
  }, (state) => states.push(state), 100000);
  return { saver, calls, states };
}
const reply = (call, revision) => call.resolve({ answers: call.input.answers, revision, updatedAt: '2026-09-28T12:00:00Z' });

test('restores server answers and removes cleared answers from a full draft snapshot', () => {
  assert.deepEqual(answerMap({ ...empty, answers: [{ questionId: 'q', answer: 'saved' }] }), { q: 'saved' });
  assert.deepEqual(answerList({ q: 'latest', cleared: '', whitespace: '  ' }), [{ questionId: 'q', answer: 'latest' }]);
});

test('rapid edits during an in-flight save are serialized and use the acknowledged revision', async () => {
  const f = fixture();
  f.saver.update({ q: 'first' });
  const saving = f.saver.flush();
  f.saver.update({ q: 'second' });
  f.saver.update({ q: 'latest', q2: 'B' });
  assert.equal(f.calls.length, 1);
  assert.equal(f.saver.state.status, 'saving');
  reply(f.calls[0], 1);
  await turn();
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[1].input, { revision: 1, answers: [{ questionId: 'q', answer: 'latest' }, { questionId: 'q2', answer: 'B' }] });
  assert.equal(f.saver.state.dirty, true);
  reply(f.calls[1], 2);
  await saving;
  assert.equal(f.saver.state.status, 'saved');
  assert.equal(f.saver.state.dirty, false);
  assert.equal(f.saver.state.revision, 2);
  f.saver.dispose();
});

test('reverting to an older value during a write still sends the revert after acknowledgement', async () => {
  const f = fixture({ ...empty, answers: [{ questionId: 'q', answer: 'original' }] });
  f.saver.update({ q: 'temporary' });
  const saving = f.saver.flush();
  f.saver.update({ q: 'original' });
  reply(f.calls[0], 1);
  await turn();
  assert.deepEqual(f.calls[1].input.answers, [{ questionId: 'q', answer: 'original' }]);
  reply(f.calls[1], 2);
  await saving;
  assert.equal(f.saver.state.dirty, false);
  f.saver.dispose();
});

test('lost network acknowledgement preserves edits, stops retry loops, and allows explicit recovery', async () => {
  const f = fixture();
  f.saver.update({ q: 'first' });
  const saving = f.saver.flush();
  f.calls[0].reject(new Error('offline'));
  await saving;
  assert.equal(f.saver.state.status, 'offline');
  f.saver.update({ q: 'latest offline edit' });
  await turn();
  assert.equal(f.calls.length, 1);
  const retry = f.saver.flush();
  assert.deepEqual(f.calls[1].input.answers, [{ questionId: 'q', answer: 'latest offline edit' }]);
  reply(f.calls[1], 1);
  await retry;
  assert.equal(f.saver.state.status, 'saved');
  f.saver.dispose();
});

test('a second-tab conflict never blindly retries or overwrites newer server content', async () => {
  const f = fixture();
  f.saver.update({ q: 'local' });
  const saving = f.saver.flush();
  f.calls[0].reject({ response: { status: 409, data: { code: 'DRAFT_CONFLICT' } } });
  await saving;
  assert.equal(f.saver.state.status, 'conflict');
  await f.saver.flush();
  f.saver.update({ q: 'another local edit' });
  await f.saver.flush();
  assert.equal(f.calls.length, 1);
  f.saver.replaceFromServer({ answers: [{ questionId: 'q', answer: 'other tab' }], revision: 5, updatedAt: null });
  assert.equal(f.saver.state.dirty, false);
  f.saver.update({ q: 'deliberate new edit' });
  const recovered = f.saver.flush();
  assert.equal(f.calls[1].input.revision, 5);
  reply(f.calls[1], 6);
  await recovered;
  f.saver.dispose();
});

test('unmount/submission aborts the request and ignores its late result', async () => {
  const f = fixture();
  f.saver.update({ q: 'answer' });
  const saving = f.saver.flush();
  const stateCount = f.states.length;
  f.saver.dispose();
  assert.equal(f.calls[0].signal.aborted, true);
  reply(f.calls[0], 1);
  await saving;
  assert.equal(f.states.length, stateCount);
  assert.equal(f.saver.state.status, 'stopped');
  f.saver.update({ q: 'ignored' });
  await f.saver.flush();
  assert.equal(f.calls.length, 1);
});

test('concurrent flush requests never create two writers', async () => {
  const f = fixture();
  f.saver.update({ q: 'answer' });
  const first = f.saver.flush();
  const second = f.saver.flush();
  assert.equal(f.calls.length, 1);
  reply(f.calls[0], 1);
  await Promise.all([first, second]);
  f.saver.dispose();
});

test('debounce coalesces edits and server errors stay visible instead of reporting saved', async () => {
  const calls = [];
  const saver = new ExamDraftSaver(empty, async (input) => { calls.push(input); throw { response: { status: 400, data: { code: 'INVALID_ANSWER' } } }; }, () => {}, 10);
  saver.update({ q: 'one' });
  saver.update({ q: 'two' });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].answers[0].answer, 'two');
  assert.equal(saver.state.status, 'error');
  assert.equal(saver.state.dirty, true);
  saver.dispose();
});

test('reordering unchanged answers avoids needless revisions and replacing active writes is forbidden', async () => {
  const f = fixture({ ...empty, answers: [{ questionId: 'a', answer: 'A' }, { questionId: 'b', answer: 'B' }] });
  f.saver.update({ b: 'B', a: 'A' });
  await f.saver.flush();
  assert.equal(f.calls.length, 0);
  f.saver.update({ a: 'C' });
  const saving = f.saver.flush();
  assert.throws(() => f.saver.replaceFromServer(empty), /still active/);
  reply(f.calls[0], 1);
  await saving;
  f.saver.dispose();
});

test('server-closed and expired attempts stop autosave instead of retrying an impossible draft', async () => {
  for (const code of ['ATTEMPT_CLOSED', 'EXAM_EXPIRED']) {
    const f = fixture();
    f.saver.update({ q: 'local' });
    const saving = f.saver.flush();
    f.calls[0].reject({ response: { status: code === 'ATTEMPT_CLOSED' ? 409 : 400, data: { code } } });
    await saving;
    assert.equal(f.saver.state.status, 'closed');
    f.saver.update({ q: 'ignored by server' });
    await f.saver.flush();
    assert.equal(f.calls.length, 1);
    f.saver.dispose();
  }
});
