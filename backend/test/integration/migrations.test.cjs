const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

// Refuse application/production URLs, even when DATABASE_URL is set.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('Set TEST_DATABASE_URL to the dedicated local proctolearn_security_test database');
const parsed = new URL(testUrl);
if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/proctolearn_security_test') {
  throw new Error('Migration tests require a local database named proctolearn_security_test');
}

const backend = path.resolve(__dirname, '../..');
const cli = require.resolve('prisma/build/index.js');
const baseline = '20260926000000_baseline';

function prisma(url, ...args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: backend,
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `prisma ${args[0]} ${args[1]} failed:\n${result.stdout}\n${result.stderr}`);
}

async function isolatedSchema(work) {
  // Only this run's random schema is created/dropped; public fixtures remain intact.
  const schema = `migration_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(testUrl);
  url.searchParams.set('schema', schema);
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  const admin = new PrismaClient({ datasources: { db: { url: testUrl } } });
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    await work(db, url.href);
  } finally {
    await db.$disconnect();
    try {
      if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await admin.$disconnect();
    }
  }
}

async function verifyHistory(db) {
  const rows = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  assert.deepEqual(rows.map((r) => r.migration_name), [baseline, '20260926010000_session_version']);
}

function verifyNoDrift(url) {
  prisma(url, 'migrate', 'diff', '--from-url', url, '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code');
}

test('fresh database deploy matches Prisma schema and can be repeated', async () => {
  await isolatedSchema(async (db, url) => {
    prisma(url, 'migrate', 'deploy');
    const user = await db.user.create({ data: { email: 'fresh@example.invalid', name: 'Migration fixture', password: 'not-a-login-hash' } });
    assert.equal(user.tokenVersion, 0);
    prisma(url, 'migrate', 'deploy');
    assert.deepEqual(await db.user.findUnique({ where: { id: user.id } }), user);
    await verifyHistory(db);
    verifyNoDrift(url);
  });
});

test('baselined legacy database preserves users and course enrollment during upgrade', async () => {
  await isolatedSchema(async (db, url) => {
    prisma(url, 'db', 'execute', '--file', `prisma/migrations/${baseline}/migration.sql`, '--url', url);
    const columns = await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'tokenVersion'`;
    assert.equal(columns.length, 0, 'fixture must start with the old schema');
    await db.$executeRaw`INSERT INTO "users" (id, name, email, password, role) VALUES ('teacher', 'Teacher fixture', 'teacher@example.invalid', 'preserve-hash', 'TEACHER'), ('student', 'Student fixture', 'student@example.invalid', 'preserve-student-hash', 'STUDENT')`;
    await db.$executeRaw`INSERT INTO courses (id, title, "teacherId") VALUES ('course', 'Preserved course', 'teacher')`;
    await db.$executeRaw`INSERT INTO enrollments (id, "userId", "courseId") VALUES ('enrollment', 'student', 'course')`;
    const before = await db.$queryRaw`SELECT * FROM users ORDER BY id`;
    prisma(url, 'migrate', 'resolve', '--applied', baseline);
    prisma(url, 'migrate', 'deploy');
    prisma(url, 'migrate', 'deploy');
    const after = await db.user.findMany({ orderBy: { id: 'asc' } });
    assert.deepEqual(after.map(({ tokenVersion, ...user }) => user), before);
    assert.ok(after.every((user) => user.tokenVersion === 0));
    const enrollment = await db.enrollment.findUnique({ where: { id: 'enrollment' }, include: { course: true } });
    assert.equal(enrollment.userId, 'student');
    assert.equal(enrollment.course.title, 'Preserved course');
    assert.equal(enrollment.course.teacherId, 'teacher');
    await verifyHistory(db);
    verifyNoDrift(url);
  });
});
