const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/lib/proctor-feed.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { mergeProctorEvents, mergeProctorSignals } = compiled.exports;
const event = (id, seconds, attemptId = 'selected') => ({ id, attemptId, type: 'tab_switch', timestamp: new Date(seconds * 1000).toISOString() });

test('a late HTTP snapshot preserves newer live events and overlapping delivery appears once', () => {
  const snapshot = [event('old', 1), event('overlap', 2)];
  const live = [event('new', 3), event('overlap', 2)];
  const result = mergeProctorEvents('selected', snapshot, live);
  assert.deepEqual(result.map(item => item.id), ['new', 'overlap', 'old']);
  assert.deepEqual(mergeProctorEvents('selected', live, snapshot), result);
  assert.deepEqual(snapshot.map(item => item.id), ['old', 'overlap']);
});

test('events from a previously selected attempt cannot enter the new feed', () => {
  assert.deepEqual(mergeProctorEvents('selected', [event('foreign', 5, 'previous')], [event('own', 1)]).map(item => item.id), ['own']);
});

test('out-of-order and repeated deliveries retain exactly the newest 50 unique events', () => {
  const batch = Array.from({ length: 70 }, (_, i) => event(String(i), i));
  const result = mergeProctorEvents('selected', batch, batch.slice().reverse());
  assert.equal(result.length, 50);
  assert.equal(result[0].id, '69');
  assert.equal(result.at(-1).id, '20');
  assert.equal(new Set(result.map(item => item.id)).size, 50);
});

test('stale summaries and out-of-order socket scores cannot undo a deduction or a flag', () => {
  const flaggedAt = '2026-09-28T00:00:00.000Z';
  const latest = { trustScore: 70, flaggedAt };
  assert.deepEqual(mergeProctorSignals(latest, { trustScore: 90, flaggedAt: null }), latest);
  assert.deepEqual(mergeProctorSignals(latest, { trustScore: 50 }), { trustScore: 50, flaggedAt });
  assert.deepEqual(mergeProctorSignals({ trustScore: 100 }, { trustScore: 0, flaggedAt }), { trustScore: 0, flaggedAt });
});
