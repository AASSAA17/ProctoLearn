const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepare, safeName, operatorBackup, optionalConfiguration, main } = require('./demo-release.cjs');
const { lessons, questions, courseData } = require('./demo-release-seed.cjs');

test('AI-disabled demonstration is explicit and never selects an external provider', () => {
  assert.equal(optionalConfiguration({}).AI_PROVIDER, 'ollama');
  const disabled = optionalConfiguration({ DEMO_AI_PROVIDER: 'off' });
  assert.equal(disabled.AI_PROVIDER, 'off');
  assert.equal(disabled.OLLAMA_BASE_URL, 'http://127.0.0.1:11434');
  assert.throws(() => optionalConfiguration({ DEMO_AI_PROVIDER: 'cloud' }), /must be ollama or off/);
  const phoneLink = optionalConfiguration({ DEMO_PUBLIC_APP_URL: 'https://demo.example.test' });
  assert.equal(phoneLink.CERTIFICATE_PUBLIC_ORIGIN, 'https://demo.example.test');
  assert.equal(phoneLink.NEXT_PUBLIC_API_URL, undefined, 'a QR origin alone does not configure a reachable browser API');
});

test('release preparation uses separate identities, stable credentials and preserves owner files', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proctolearn-release-test-'));
  try {
    const env = prepare(directory);
    assert.equal(env.POSTGRES_DB, 'proctolearn_release');
    assert.equal(env.MINIO_BUCKET, 'proctolearn-release');
    const files = ['.env.local', 'ownership.json', 'accounts.json', 'DEMO_ACCESS.txt'];
    const before = files.map(file => fs.readFileSync(path.join(directory, file), 'utf8'));
    const accounts = JSON.parse(before[2]);
    assert.equal(accounts.length, 8);
    assert.equal(new Set(accounts.map(account => account.password)).size, 8);
    assert.deepEqual(accounts.map(account => account.role), ['ADMIN', 'TEACHER', 'TEACHER', 'PROCTOR', 'PROCTOR', 'STUDENT', 'STUDENT', 'STUDENT']);
    fs.writeFileSync(path.join(directory, 'owner-note'), 'keep owner note');
    assert.deepEqual(prepare(directory), env);
    assert.deepEqual(files.map(file => fs.readFileSync(path.join(directory, file), 'utf8')), before);
    assert.equal(fs.readFileSync(path.join(directory, 'owner-note'), 'utf8'), 'keep owner note');
    const operatorDirectory = path.join(directory, 'operator-copy');
    operatorBackup(directory, operatorDirectory);
    assert.deepEqual(files.map(file => fs.readFileSync(path.join(operatorDirectory, file), 'utf8')), before);
    assert.equal(JSON.parse(fs.readFileSync(path.join(operatorDirectory, 'operator-manifest.json'))).files.length, 4);
    assert.throws(() => operatorBackup(directory, operatorDirectory), /EEXIST/);
    fs.mkdirSync(path.join(directory, 'postgres'));
    fs.writeFileSync(path.join(directory, 'postgres', 'PG_VERSION'), '18');
    fs.unlinkSync(path.join(directory, 'accounts.json'));
    assert.throws(() => prepare(directory), /no new credentials/);
    assert.equal(fs.existsSync(path.join(directory, 'accounts.json')), false);
    fs.writeFileSync(path.join(directory, 'ownership.json'), '{"kind":"unknown"}');
    assert.throws(() => prepare(directory), /ownership marker/);
  } finally {
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('proctolearn-release-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
test('unmarked data and unknown commands are rejected without adoption or reset', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proctolearn-release-test-'));
  try {
    fs.writeFileSync(path.join(directory, 'existing-data'), 'preserve');
    assert.throws(() => prepare(directory), /refusing to adopt/);
    assert.equal(fs.readFileSync(path.join(directory, 'existing-data'), 'utf8'), 'preserve');
    assert.equal(fs.existsSync(path.join(directory, 'ownership.json')), false);
    for (const name of ['../old', 'C:\\data', '', 'UPPER', 'a/b']) assert.throws(() => safeName(name));
    assert.equal(safeName('release-20261010'), 'release-20261010');
    await assert.rejects(main(['reset']), /Usage/);
    await assert.rejects(main(['start-restored', '../restore-123.json']), /verified restore/);
    await assert.rejects(main(['exec', '../../outside', 'script.cjs']), /backend\|frontend/);
  } finally {
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('proctolearn-release-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
test('original fixture has coherent ordered lessons, practice and all supported exam types', () => {
  const course = courseData();
  assert.equal(course.modules.create.length, 2);
  assert.equal(lessons.length, 5);
  assert.equal(questions.length, 8);
  assert.deepEqual([...new Set(questions.map(question => question.type))].sort(), ['MULTIPLE_CHOICE', 'SINGLE_CHOICE', 'TEXT']);
  for (const question of questions) {
    assert.ok(question.answer);
    if (question.type === 'SINGLE_CHOICE') assert.ok(question.options.includes(question.answer));
    if (question.type === 'MULTIPLE_CHOICE') assert.ok(JSON.parse(question.answer).every(answer => question.options.includes(answer)));
  }
  const practice = lessons.flatMap(lesson => lesson.steps).find(step => step.type === 'TASK');
  assert.ok(practice.content.options.includes(practice.content.correctAnswer));
  assert.ok(lessons.find(lesson => lesson.videoUrl)?.content.includes('Толық бейнелекция емес'));
  assert.equal(course.exams.create.duration, 3);
  assert.equal(course.exams.create.passScore, 75);
});
