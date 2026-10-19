const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/app/dashboard/dashboard-data.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

const {
  certificateJourneyStage,
  continueLearningHref,
  loadDashboardList,
  parseDashboardList,
} = compiled.exports;

const enrollment = {
  id: 'enrollment-1',
  courseId: 'course/with space',
  completedAt: null,
  course: { id: 'course/with space', title: 'HTML негіздері', level: 'BEGINNER' },
  progress: 40,
  completedLessons: 4,
  totalLessons: 10,
};

test('a failed certificate request cannot hide a successfully loaded course', async () => {
  const [enrollments, attempts, certificates] = await Promise.all([
    loadDashboardList(async () => ({ data: [enrollment] })),
    loadDashboardList(async () => ({ data: [] })),
    loadDashboardList(async () => { throw Object.assign(new Error('unauthorized'), { response: { status: 401 } }); }),
  ]);

  assert.equal(enrollments.status, 'success');
  assert.equal(attempts.status, 'success');
  assert.equal(certificates.status, 'error');
  assert.equal(continueLearningHref(enrollments.data[0]), '/dashboard/courses/course%2Fwith%20space');
});

test('malformed or failed resources stay unknown instead of becoming a fake zero', async () => {
  assert.throws(() => parseDashboardList({ length: 0 }));
  assert.deepEqual(await loadDashboardList(async () => ({ data: { length: 0 } })), { status: 'error', data: null });
  assert.deepEqual(await loadDashboardList(async () => { throw new Error('offline'); }), { status: 'error', data: null });
  assert.deepEqual(await loadDashboardList(async () => ({ data: [] })), { status: 'success', data: [] });
});

test('certificate journey is derived only from enrollment, attempt review and certificate records', () => {
  assert.equal(certificateJourneyStage(enrollment, [], []), 'learning');
  assert.equal(certificateJourneyStage({ ...enrollment, progress: 100 }, [], []), 'exam-requirements');

  const attempt = {
    id: 'attempt-1', status: 'IN_PROGRESS', score: null, finishedAt: null, reviewStatus: 'PENDING',
    exam: { id: 'exam-1', courseId: enrollment.courseId, title: 'Қорытынды емтихан', passScore: 70 },
  };
  assert.equal(certificateJourneyStage(enrollment, [attempt], []), 'exam-in-progress');
  assert.equal(certificateJourneyStage(enrollment, [{ ...attempt, status: 'FINISHED', finishedAt: '2026-10-20', score: 90 }], []), 'review-pending');
  assert.equal(certificateJourneyStage(enrollment, [{ ...attempt, status: 'FINISHED', finishedAt: '2026-10-20', score: 90, reviewStatus: 'REJECTED' }], []), 'review-rejected');
  assert.equal(certificateJourneyStage(enrollment, [{ ...attempt, status: 'FINISHED', finishedAt: '2026-10-20', score: 90, reviewStatus: 'APPROVED' }], []), 'certificate-not-issued');
  assert.equal(certificateJourneyStage(enrollment, [{ ...attempt, status: 'FAILED', finishedAt: '2026-10-20' }], []), 'exam-not-passed');
  assert.equal(certificateJourneyStage(enrollment, [{ ...attempt, status: 'FLAGGED', finishedAt: null }], []), 'exam-status-unknown');
  assert.equal(certificateJourneyStage(enrollment, [], [{ id: 'certificate-1', courseId: enrollment.courseId, status: 'VALID' }]), 'certificate-valid');
  assert.equal(certificateJourneyStage(enrollment, [], [{ id: 'certificate-1', courseId: enrollment.courseId, status: 'REVOKED' }]), 'certificate-revoked');
});

test('dashboard keeps all three authenticated API resources independent', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/app/dashboard/page.tsx'), 'utf8');
  for (const endpoint of ['/enrollments/my', '/attempts/my', '/certificates/my']) {
    assert.match(source, new RegExp(`api\\.get\\('${endpoint}'\\)`));
  }
  assert.doesNotMatch(source, /Promise\.all\s*\(/);
  assert.match(source, /Күйі белгісіз/);
});
