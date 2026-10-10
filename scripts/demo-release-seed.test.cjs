const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { prepare } = require('./demo-release.cjs');
const { connectionUrl } = require('./local-launch.cjs');
const { seed, COURSE_ID } = require('./demo-release-seed.cjs');
const backendRequire = createRequire(path.join(__dirname, '../backend/package.json'));

test('rerunning the release seed preserves existing authored course and account credentials', async () => {
  const env = prepare();
  if (process.env.DATABASE_URL !== connectionUrl(env) || process.env.E2E_DISPOSABLE !== 'true') throw new Error('Run through demo-release.cjs exec backend ../scripts/demo-release-seed.test.cjs against the isolated release profile.');
  const { PrismaClient } = backendRequire('@prisma/client');
  const prisma = new PrismaClient();
  const snapshot = async () => {
    const accounts = await prisma.user.findMany({ where: { id: { startsWith: 'demo-release-' } }, orderBy: { id: 'asc' }, select: { id: true, email: true, name: true, role: true, password: true } });
    const course = await prisma.course.findUniqueOrThrow({ where: { id: COURSE_ID }, include: {
      modules: { orderBy: { order: 'asc' }, include: { lessons: { orderBy: { order: 'asc' }, include: { steps: { orderBy: { order: 'asc' } } } } } },
      exams: { orderBy: { id: 'asc' }, include: { questions: { orderBy: { id: 'asc' } }, proctorAssignments: { orderBy: { proctorId: 'asc' } } } },
    } });
    const progress = await prisma.lessonProgress.findMany({ where: { courseId: COURSE_ID }, orderBy: { id: 'asc' } });
    const enrollments = await prisma.enrollment.findMany({ where: { courseId: COURSE_ID }, orderBy: { id: 'asc' } });
    // Only a digest enters assertion output; private passwords/hashes never appear in a failure report.
    return { accountCount: accounts.length, progressCount: progress.length, digest: createHash('sha256').update(JSON.stringify({ accounts, course, progress, enrollments })).digest('hex') };
  };
  try {
    const before = await snapshot();
    assert.equal(before.accountCount, 8);
    await seed({ ...process.env, ALLOW_DEMO_SEED: 'true', DEMO_RELEASE_DIR: path.resolve(__dirname, '../.local/release-demo') });
    assert.deepEqual(await snapshot(), before);
  } finally { await prisma.$disconnect(); }
});
