#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..'); const directory = path.join(ROOT, '.local/pilot-author');
const python = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const output = path.join(directory, 'evidence/python-projects'); fs.mkdirSync(output, { recursive: true });
const get = id => JSON.parse(fs.readFileSync(path.join(directory, 'courses/' + id + '.json'))).modules.flatMap(m => m.lessons);
const report = { at: new Date().toISOString(), checks: [], humanReview: 'PENDING' };
const expected = ['C B', '3', "['A'] []", 'Кітап: 3', 'Кітап', 'Оқу\nОҚУ', 'True', ''];
for (const [i, lesson] of get('C14').entries()) {
  if (i === 8) { report.checks.push({ lesson: lesson.authoringId, result: 'HUMAN_REVIEW_PENDING', scope: 'Refactoring protocol requires independent project review' }); continue; }
  let code = lesson.example.code;
  if (i === 7) code = get('C14')[2].example.code.split('a=Shelf()')[0] + '\n' + code + '\nunittest.main()';
  assert.ok(!/\b(?:open|exec|eval|subprocess|socket|requests)\b/.test(code));
  const run = spawnSync(python, ['-I', '-X', 'utf8', '-c', code], { cwd: output, encoding: 'utf8', timeout: 5000, windowsHide: true });
  assert.equal(run.status, 0, lesson.authoringId); assert.equal(run.stdout.trim().replaceAll('\r\n', '\n'), expected[i]);
  report.checks.push({ lesson: lesson.authoringId, result: 'PASS', scope: i === 7 ? 'Actual unittest with explicitly taught Shelf fixture definition' : 'Actual original Python example output' });
}
for (const [i, lesson] of get('C15').entries()) {
  if ([2, 7, 8].includes(i)) { report.checks.push({ lesson: lesson.authoringId, result: 'HUMAN_REVIEW_PENDING', scope: 'Data question/interpretation/reproducibility protocol, not executable source' }); continue; }
  assert.ok(!/\b(?:exec|eval|subprocess|socket|requests)\b/.test(lesson.example.code));
  const setup = 'import sys\nsys.path.insert(0,' + JSON.stringify(path.join(ROOT, '.local/tools/course-python')) + ')\nimport pandas as pd\n';
  const checks = { 0: '\nassert df.shape == (2,2)\nassert df.pages.sum() == 30', 1: '\nassert df.pages.isna().sum() == 1\nassert df.pages.mean() == 20',
    3: '\nassert clean.isna().sum() == 1\nassert clean.dropna().sum() == 30', 4: '\nassert len(clean) == 2', 5: '\nassert df.groupby("club").pages.sum().to_dict() == {"A":30,"B":5}',
    6: '\nassert list(ax.lines[0].get_xdata()) == [1,2,3]\nassert ax.get_ylabel() == "Бет"\nassert len(ax.lines[0].get_ydata()) == 3\nplt.close(fig)' };
  const run = spawnSync(python, ['-I', '-X', 'utf8', '-c', setup + (i === 6 ? 'import matplotlib\nmatplotlib.use("Agg")\n' : '') + lesson.example.code + checks[i]],
    { cwd: output, env: { ...process.env, MPLCONFIGDIR: path.join(output, 'matplotlib-cache') }, encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(run.status, 0, lesson.authoringId + ': ' + run.stderr);
  if (i === 6) { assert.ok(fs.statSync(path.join(output, 'study-pages.png')).size > 1000); assert.ok(!run.stderr.includes('Glyph'), 'Kazakh glyph support warning'); }
  report.checks.push({ lesson: lesson.authoringId, result: 'PASS', environment: 'Python3.12.14 / pandas3.0.1 / matplotlib3.11.2 where used, synthetic local data' });
}
fs.writeFileSync(path.join(directory, 'python-project-examples.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ oopExamples: 8, dataExamples: 6, actualChart: 'evidence/python-projects/study-pages.png', humanProtocols: 'PENDING' }));
