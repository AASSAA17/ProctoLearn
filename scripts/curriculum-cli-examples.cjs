#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const directory = path.join(ROOT, '.local/pilot-author');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'proctolearn-author-cli-'));
const study = path.join(temporary, 'study'); fs.mkdirSync(study);
const identity = { ...process.env, GIT_CONFIG_GLOBAL: path.join(temporary, 'no-global-config'), GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'ProctoLearn disposable QA fixture', GIT_AUTHOR_EMAIL: 'qa@example.invalid', GIT_COMMITTER_NAME: 'ProctoLearn disposable QA fixture', GIT_COMMITTER_EMAIL: 'qa@example.invalid',
  GIT_TERMINAL_PROMPT: '0' };
function git(args, expected = 0, cwd = study) {
  const result = spawnSync('git', args, { cwd, env: identity, encoding: 'utf8', timeout: 5000, windowsHide: true });
  assert.equal(result.status, expected, 'Disposable git command status: ' + args[0]); return result.stdout.trim();
}
const report = { at: new Date().toISOString(), checks: [], scope: 'Disposable synthetic repositories; genuine current timestamps, no public push or owner-work authorship claim' };
function pass(id, scope) { report.checks.push({ lesson: id, result: 'PASS', scope }); }
try {
  git(['init', '-b', 'main']); assert.equal(git(['rev-list', '--all', '--count']), '0'); pass('C05-L01', 'Actual init/status in new directory');
  fs.writeFileSync(path.join(study, 'notes.txt'), 'First staged version\n'); git(['add', 'notes.txt']);
  fs.writeFileSync(path.join(study, 'notes.txt'), 'Second unstaged version\n'); git(['commit', '-m', 'Synthetic staging fixture']);
  assert.equal(git(['show', 'HEAD:notes.txt']), 'First staged version'); pass('C05-L02', 'Commit preserves index, not later unstaged edit'); git(['add', 'notes.txt']); git(['commit', '-m', 'Synthetic working copy fixture']);
  fs.writeFileSync(path.join(study, '.gitignore'), 'private-notes.txt\n'); fs.writeFileSync(path.join(study, 'private-notes.txt'), 'Fictional data only');
  assert.equal(git(['check-ignore', 'private-notes.txt']), 'private-notes.txt'); assert.ok(git(['log', '--oneline'])); pass('C05-L03', 'History and untracked ignore');
  git(['switch', '-c', 'docs/reading-plan']); assert.equal(git(['branch', '--show-current']), 'docs/reading-plan'); pass('C05-L04', 'Branch based on actual current commit');
  git(['switch', '-c', 'schedule-change']); fs.writeFileSync(path.join(study, 'notes.txt'), 'Sunday fixture\n'); git(['add', 'notes.txt']); git(['commit', '-m', 'Synthetic Sunday fixture']);
  git(['switch', 'docs/reading-plan']); fs.writeFileSync(path.join(study, 'notes.txt'), 'Saturday fixture\n'); git(['add', 'notes.txt']); git(['commit', '-m', 'Synthetic Saturday fixture']);
  git(['merge', 'schedule-change'], 1); assert.ok(fs.readFileSync(path.join(study, 'notes.txt'), 'utf8').includes('<<<<<<<'));
  fs.writeFileSync(path.join(study, 'notes.txt'), 'Owner decision required, synthetic resolution\n'); git(['add', 'notes.txt']); git(['commit', '-m', 'Synthetic resolved conflict']); pass('C05-L05', 'Actual conflict markers and resolved merge, no fabricated human scheduling decision');
  fs.writeFileSync(path.join(study, 'change.txt'), 'Temporary synthetic change\n'); git(['add', 'change.txt']); git(['commit', '-m', 'Synthetic reversible change']);
  const count = Number(git(['rev-list', '--all', '--count'])); git(['revert', '--no-edit', 'HEAD']); assert.equal(Number(git(['rev-list', '--all', '--count'])), count + 1); assert.equal(fs.existsSync(path.join(study, 'change.txt')), false); pass('C05-L06', 'Real revert adds new history without reset');
  const remote = path.join(temporary, 'remote.git'); git(['init', '--bare', '-b', 'main', remote]); git(['remote', 'add', 'origin', remote]); git(['push', 'origin', 'HEAD:main']); git(['fetch', 'origin']); assert.equal(git(['rev-parse', 'origin/main']), git(['rev-parse', 'HEAD'])); pass('C05-L07', 'Real local bare remote fetch; no external GitHub account needed');
  git(['push', '-u', 'origin', 'docs/reading-plan']); assert.equal(git(['rev-parse', '--abbrev-ref', '@{upstream}']), 'origin/docs/reading-plan'); pass('C05-L08', 'Real push to disposable local remote/upstream; GitHub PR UI review remains operator action');
  report.checks.push({ lesson: 'C05-L09', result: 'HUMAN_REVIEW_PENDING', scope: 'Truthful work ledger is a review exercise, not executable code' });
  const lessons = JSON.parse(fs.readFileSync(path.join(directory, 'courses/C06.json'))).modules.flatMap(m => m.lessons);
  const bash = 'C:/Program Files/Git/bin/bash.exe';
  fs.mkdirSync(path.join(study, 'study')); fs.writeFileSync(path.join(study, 'private-study.txt'), 'Fictional\n');
  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    const run = spawnSync(bash, ['--noprofile', '--norc', '-c', lesson.example.code, 'author-fixture', ...(i === 8 ? ['notes.txt'] : [])],
      { cwd: study, env: { ...process.env, LC_ALL: 'C.UTF-8' }, timeout: 35000, maxBuffer: 65536, encoding: 'utf8', windowsHide: true });
    assert.equal(run.status, 0, lesson.authoringId + ' shell execution');
    if (i === 0) assert.ok(run.stdout.trim().endsWith('/study'));
    if (i === 2) assert.equal(fs.readFileSync(path.join(study, 'notes.saved.txt'), 'utf8'), fs.readFileSync(path.join(study, 'notes.txt'), 'utf8'));
    if (i === 5) assert.equal(run.stdout.trim(), 'local');
    if (i === 6) { assert.equal(fs.readFileSync(path.join(study, 'result.txt'), 'utf8').trim(), 'OK'); assert.equal(run.stderr.trim(), 'Оқу қатесі'); }
    if (i === 7) assert.equal(run.stdout.trim(), 'ERROR test');
    if (i === 8) { assert.equal(run.stdout.trim(), '1'); const bad = spawnSync(bash, ['--noprofile', '--norc', '-c', lesson.example.code], { cwd: study, encoding: 'utf8', windowsHide: true }); assert.equal(bad.status, 2); }
    report.checks.push({ lesson: lesson.authoringId, result: 'SHELL_SEMANTICS_VERIFIED', environment: 'Git Bash on Windows; not a Linux kernel',
      limitation: i === 3 ? 'Native Linux permission enforcement / ACL behavior AWAITING_LINUX_ENVIRONMENT' : 'Native Linux process/filesystem behavior not claimed' });
  }
  report.gitVersion = git(['--version']); report.result = 'PARTIAL_NATIVE_LINUX_PENDING';
  fs.writeFileSync(path.join(directory, 'cli-examples.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ gitExamplesVerified: 8, bashExamplesExecuted: 9, gitLedgerReview: 'PENDING', nativeLinux: 'AWAITING_ENVIRONMENT' }));
} finally {
  const absolute = path.resolve(temporary); assert.ok(absolute.startsWith(path.resolve(os.tmpdir()) + path.sep + 'proctolearn-author-cli-'));
  fs.rmSync(absolute, { recursive: true, force: true });
}
