const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const sourcePath = path.resolve(__dirname, '../src/lib/recording.ts');
const compiled = new Module(sourcePath, module);
compiled._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, sourcePath);
const { stopRecorder } = compiled.exports;

test('stopRecorder includes the final chunk before resolving', async () => {
  const recorder = new EventTarget();
  recorder.state = 'recording';
  const chunks = [];
  recorder.stop = () => {
    recorder.state = 'inactive';
    queueMicrotask(() => {
      recorder.dispatchEvent(new Event('dataavailable'));
      recorder.dispatchEvent(new Event('stop'));
    });
  };
  recorder.addEventListener('dataavailable', () => chunks.push('last chunk'));
  const stopped = stopRecorder(recorder);
  assert.equal(chunks.length, 0);
  await stopped;
  assert.deepEqual(chunks, ['last chunk']);
});
test('missing and already stopped recorders resolve without calling stop', async () => {
  await stopRecorder(null);
  await stopRecorder({ state: 'inactive', stop: () => assert.fail() });
});
test('recorder error rejects instead of reporting successful recording', async () => {
  const recorder = new EventTarget();
  recorder.state = 'recording';
  recorder.stop = () => queueMicrotask(() => recorder.dispatchEvent(new Event('error')));
  await assert.rejects(stopRecorder(recorder), /Recording failed/);
});
