const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const sourcePath = path.resolve(__dirname, '../src/lib/learning-progress.ts');
const compiled = new Module(sourcePath, module);
compiled._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, sourcePath);
const { saveLearningProgress } = compiled.exports;

const reading = { id: 'read', type: 'TEXT' };
const task = { id: 'task', type: 'TASK' };
const lesson = { id: 'lesson', steps: [reading, task] };
const complete = [{ id: 'read', completed: true }, { id: 'task', completed: true }];
function fixture(progress = complete) {
  const calls = [];
  return { calls, api: {
    post: async (path) => { calls.push(['post', path]); },
    get: async (path) => { calls.push(['get', path]); return { data: progress }; },
  } };
}

test('reading completion is persisted before server-confirmed lesson completion', async () => {
  const f = fixture();
  const result = await saveLearningProgress(f.api, 'course', lesson, reading);
  assert.deepEqual(f.calls, [
    ['post', '/steps/read/complete'], ['get', '/submissions/lesson/lesson/progress'], ['post', '/courses/course/lessons/lesson/complete'],
  ]);
  assert.equal(result.lessonCompleted, true);
  assert.deepEqual(result.completedStepIds, ['read', 'task']);
});

test('task completion relies on a graded submission and never calls the reading bypass endpoint', async () => {
  const f = fixture();
  await saveLearningProgress(f.api, 'course', lesson, task);
  assert.deepEqual(f.calls.map(([, path]) => path), ['/submissions/lesson/lesson/progress', '/courses/course/lessons/lesson/complete']);
});

test('incomplete or duplicate server progress does not mark the lesson complete', async () => {
  const f = fixture([{ id: 'read', completed: true }, { id: 'read', completed: true }, { id: 'task', completed: false }, { id: 'foreign', completed: true }]);
  const result = await saveLearningProgress(f.api, 'course', lesson, task);
  assert.equal(result.lessonCompleted, false);
  assert.deepEqual(result.completedStepIds, ['read']);
  assert.equal(f.calls.length, 1);
});

test('mixed lessons still require their written assignment after all steps succeed', async () => {
  const f = fixture();
  const result = await saveLearningProgress(f.api, 'course', { ...lesson, hasAssignment: true }, task);
  assert.equal(result.lessonCompleted, false);
  assert.equal(f.calls.length, 1);
});

test('failed reading save does not report local success or complete a lesson', async () => {
  const f = fixture();
  f.api.post = async () => { throw new Error('offline'); };
  await assert.rejects(saveLearningProgress(f.api, 'course', lesson, reading), /offline/);
  assert.deepEqual(f.calls, []);
});

test('failed lesson completion is exposed and can be safely retried after a successful task', async () => {
  const f = fixture();
  const save = f.api.post;
  f.api.post = async () => { throw new Error('save failed'); };
  await assert.rejects(saveLearningProgress(f.api, 'course', lesson, task), /save failed/);
  f.api.post = save;
  const retried = await saveLearningProgress(f.api, 'course', lesson, task);
  assert.equal(retried.lessonCompleted, true);
});
