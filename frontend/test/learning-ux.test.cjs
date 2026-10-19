const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(name) {
  const filename = path.resolve(__dirname, `../src/lib/${name}.ts`);
  const compiled = new Module(filename, module);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return compiled.exports;
}

const { classifyLearningMedia, isAllowedLearningEmbed } = load('learning-media');
const { buildLearningNavList, chooseLearningStep, countCompletedLearningSteps } = load('learning-navigation');

test('learning media separates direct files, allowlisted embeds, links and invalid schemes', () => {
  assert.deepEqual(classifyLearningMedia('/media/lesson.webm?revision=2'), { kind: 'direct', url: '/media/lesson.webm?revision=2' });
  assert.deepEqual(classifyLearningMedia('https://cdn.example.test/video.MP4#chapter'), { kind: 'direct', url: 'https://cdn.example.test/video.MP4#chapter' });
  assert.deepEqual(classifyLearningMedia('https://www.youtube-nocookie.com/embed/abc'), { kind: 'embed', url: 'https://www.youtube-nocookie.com/embed/abc' });
  assert.deepEqual(classifyLearningMedia('https://player.vimeo.com/video/123'), { kind: 'embed', url: 'https://player.vimeo.com/video/123' });
  assert.deepEqual(classifyLearningMedia('https://videos.example.test/watch/123'), { kind: 'link', url: 'https://videos.example.test/watch/123' });
  assert.deepEqual(classifyLearningMedia('javascript:alert(1)'), { kind: 'invalid', url: '' });
});

test('embed allowlist rejects lookalike hosts and non-embed paths', () => {
  for (const value of [
    'https://youtube.example.test/embed/abc',
    'https://www.youtube.com.evil.invalid/embed/abc',
    'https://www.youtube.com/watch?v=abc',
    '/embed/local-frame',
  ]) assert.equal(isAllowedLearningEmbed(value), false, value);
});

const modules = [
  { id: 'm2', title: 'Second', order: 2, lessons: [{ id: 'l2', title: 'Later', order: 1, steps: [{ id: 's3', type: 'TASK', order: 1 }] }] },
  { id: 'm1', title: 'First', order: 1, lessons: [{ id: 'l1', title: 'Start', order: 1, steps: [{ id: 's2', type: 'TASK', order: 2 }, { id: 's1', type: 'TEXT', order: 1 }] }] },
];

test('learning outline follows module, lesson and step order', () => {
  assert.deepEqual(buildLearningNavList(modules).map((item) => item.stepId), ['s1', 's2', 's3']);
});

test('continue learning preserves a valid direct step and otherwise selects first unfinished', () => {
  const items = buildLearningNavList(modules);
  assert.equal(chooseLearningStep(items, 's3', new Set(['s1'])), 's3');
  assert.equal(chooseLearningStep(items, 'unknown', new Set(['s1'])), 's2');
  assert.equal(chooseLearningStep(items, null, new Set(['s1', 's2', 's3'])), 's1');
  assert.equal(chooseLearningStep([], null, new Set()), null);
});

test('progress count only includes steps in the current course outline', () => {
  const items = buildLearningNavList(modules);
  assert.equal(countCompletedLearningSteps(items, new Set(['s1', 's3', 'foreign'])), 2);
});

test('learner component does not render private answers and preview guards academic writes', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/components/learning/StepContent.tsx'), 'utf8');
  assert.equal(source.includes('correctAnswer'), false);
  assert.match(source, /if \(preview \|\| saving \|\| saved \|\| completed \|\| !onComplete\)/);
  assert.match(source, /if \(preview \|\| completed \|\| disabled \|\| submitting \|\| !hasAnswer\) return/);
  assert.equal((source.match(/`\/steps\/\$\{stepId\}\/submit`/g) ?? []).length, 1);
  assert.equal(source.includes('Прогресті сақтау'), false);
});
