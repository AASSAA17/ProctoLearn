// UI fixtures only: intercept every /api request; never writes to pilot data.
const { chromium } = require('playwright');
const { verifyDashboardRecovery } = require('./dashboard-recovery.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const origin = 'http://127.0.0.1:3200';
const output = path.resolve(__dirname, '../../.local/ux-20261020-baseline/browser');
const course = {
  id: 'fixture-course', title: 'Қазақша сынақ курсы', description: 'Ойдан шығарылған тексеру материалы.', status: 'DRAFT', teacherId: 'fixture-user',
  lessons: [], exams: [], _count: { lessons: 1, exams: 0 },
  modules: [{ id: 'fixture-module', title: 'Бірінші модуль', order: 0, lessons: [{ id: 'fixture-lesson', title: 'Қазақша сабақ', order: 0,
    steps: [{ id: 'fixture-text', type: 'TEXT', order: 0, content: { html: '<h2>Түсіндірме</h2><p>Бұл тексеру мысалы.</p><pre><code>const answer = 42;</code></pre>' } },
      { id: 'fixture-task', type: 'TASK', order: 1, content: { taskType: 'single_choice', question: 'Қай мән сан болып табылады?', options: ['42', 'мәтін'] } }] }] }],
  preview: { readOnly: true, academicWrites: false },
};
const enrollment = { id: 'fixture-enrollment', courseId: course.id, course, completedAt: null, progress: 0, completedLessons: 0, totalLessons: 1 };
const report = { checks: [], axe: [], reflow: [], browser: '', fixtureOnly: true };
async function setup(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width || 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const calls = [];
  let certFailure = !!options.certFailure;
  let verification = options.verification || 'NOT_FOUND';
  let taskCompleted = false, progressFailed = false;
  await page.route('**/socket.io/**', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), p = url.pathname.replace(/^\/api/, '');
    calls.push({ path: p, method: request.method() });
    let status = 200, data = [];
    if (p === '/auth/registration-policy') { status = options.policyFailure ? 503 : 200; data = { registrationOpen: !options.closed, invitationRequired: !!options.closed }; }
    else if (p === '/auth/me') data = { id: 'fixture-user', name: 'Ойдан шығарылған қолданушы', email: 'fixture@example.test', role: options.role || 'STUDENT' };
    else if (p === '/auth/csrf') data = { csrfToken: 'fixture-only-token' };
    else if (p === '/auth/register') { status = 403; data = { message: 'Шақыру жарамсыз немесе мерзімі өткен' }; }
    else if (p === '/enrollments/my') data = [enrollment];
    else if (p === '/certificates/my') { status = certFailure ? 503 : 200; data = certFailure ? { message: 'Fixture unavailable' } : []; }
    else if (p === '/courses' || p === '/courses/manage') data = { data: [course], total: 1, totalPages: 1, page: 1 };
    else if (p === '/courses/fixture-course/preview' || p === '/courses/fixture-course/material' || p === '/courses/fixture-course/overview' || p === '/courses/fixture-course') data = course;
    else if (p === '/submissions/lesson/fixture-lesson/progress') {
      if (taskCompleted && !progressFailed) { progressFailed = true; status = 503; data = { message: 'Fixture save failure' }; }
      else data = taskCompleted ? [{ id: 'fixture-task', completed: true }] : [];
    }
    else if (p === '/pilot/overview') data = { limits: { participants: 10, defaultCourseSeats: 10 }, occupancy: { members: 1, active: 1, pendingInvitations: 0 },
      members: [{ status: 'ACTIVE', joinedAt: '2026-10-20', user: { id: 'fixture-member', name: 'Сынақ қатысушы', email: 'member@example.test' } }], invitations: [], courses: [] };
    else if (p.startsWith('/pilot/members/')) { status = 500; data = { message: 'Fixture failure' }; }
    else if (p.startsWith('/public/certificates/verify/')) {
      status = verification === 'UNAVAILABLE' ? 503 : 200;
      data = verification === 'VALID' ? { valid: true, certificate: { recipientName: 'Ойдан шығарылған алушы', courseTitle: course.title, issuerName: 'ProctoLearn', issuedAt: '2026-10-20', issuedVia: 'PROCTORED_EXAM' } } : { valid: false, status: verification };
    }
    else if (p.endsWith('/submit')) { taskCompleted = request.postDataJSON()?.answer?.selected === '42'; data = { isCorrect: taskCompleted, score: taskCompleted ? 100 : 0, explanation: null, correctAnswer: null }; }
    else if (request.method() !== 'GET') { status = 400; data = { message: 'No fixture writes allowed' }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return { context, page, calls, recoverCertificates: () => { certFailure = false; }, setVerification: value => { verification = value; } };
}
async function audit(page, name) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })));
  report.axe.push({ name, violations });
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true }); report.browser = browser.version();
  try {
    let s = await setup(browser, { closed: true });
    await s.page.goto(origin + '/auth/register');
    await s.page.getByText('ProctoLearn қазір жабық пилот режимінде.').waitFor();
    await s.page.getByLabel('Шақыру коды', { exact: false }).waitFor();
    assert.equal(await s.page.locator('#register-invitation').getAttribute('required'), '');
    await audit(s.page, 'closed-registration');
    report.checks.push('Closed policy explained before submit; invitation required'); await s.context.close();

    s = await setup(browser);
    await s.page.goto(origin + '/auth/register'); await s.page.locator('#register-name').waitFor();
    assert.equal(await s.page.locator('#register-invitation').count(), 0);
    report.checks.push('Open policy preserves ordinary registration'); await s.context.close();

    const unavailablePolicy = { policyFailure: true };
    s = await setup(browser, unavailablePolicy); await s.page.goto(origin + '/auth/register');
    await s.page.getByRole('alert').filter({ hasText: 'Тіркелу шарттарын жүктеу мүмкін болмады.' }).waitFor();
    assert.equal(await s.page.locator('#register-name').isDisabled(), true);
    unavailablePolicy.policyFailure = false; await s.page.getByRole('button', { name: 'Қайталау', exact: true }).click();
    await s.page.waitForFunction(() => document.querySelector('#register-name')?.matches(':enabled'));
    report.checks.push('Unavailable policy disables registration; retry recovers server-confirmed access'); await s.context.close();

    s = await setup(browser);
    await verifyDashboardRecovery(s.page, origin, origin + '/api');
    report.checks.push('Shared CI scenario: enrollments/attempts/certificates 503, healthy sections, no false zero, retry');
    await s.context.close();

    s = await setup(browser, { certFailure: true });
    await s.page.goto(origin + '/dashboard'); await s.page.getByRole('link', { name: 'Оқуды жалғастыру →', exact: true }).waitFor();
    await s.page.getByText('Күйі белгісіз').first().waitFor();
    assert.equal(await s.page.getByRole('link', { name: 'Оқуды жалғастыру →', exact: true }).getAttribute('href'), '/dashboard/courses/fixture-course');
    await audit(s.page, 'partial-dashboard');
    s.recoverCertificates(); await s.page.getByRole('button', { name: 'Сертификат күйін қайталау', exact: true }).click();
    await s.page.getByText('0 сертификат', { exact: false }).first().waitFor();
    report.checks.push('Certificate503 keeps course usable; separate retry recovers true zero'); await s.context.close();

    s = await setup(browser);
    await s.page.goto(origin + '/dashboard/courses/fixture-course/learn?step=fixture-task');
    await s.page.getByRole('radio', { name: 'мәтін', exact: true }).check();
    await s.page.getByRole('button', { name: 'Жауапты жіберу', exact: true }).click();
    await s.page.getByText('Жауап дұрыс емес', { exact: true }).waitFor();
    await s.page.getByRole('button', { name: 'Қайта жауап беру', exact: true }).click();
    await s.page.getByRole('radio', { name: '42', exact: true }).check();
    await s.page.getByRole('button', { name: 'Жауапты жіберу', exact: true }).click();
    await s.page.getByRole('button', { name: 'Қайта сақтау', exact: true }).waitFor();
    await s.page.getByRole('button', { name: 'Қайта сақтау', exact: true }).click();
    await s.page.getByText('✓ Прогресс сақталды', { exact: true }).waitFor();
    assert.equal(s.calls.filter(c => c.path.endsWith('/submit')).length, 2);
    assert.equal(s.calls.filter(c => c.path === '/steps/fixture-task/complete').length, 0);
    await audit(s.page, 'learning-feedback');
    report.checks.push('Incorrect/correct formative feedback; saved progress retry; no duplicate TASK completion'); await s.context.close();

    s = await setup(browser, { role: 'TEACHER' });
    await s.page.goto(origin + '/dashboard/teacher/courses/fixture-course/preview'); await s.page.getByRole('heading', { name: course.title, exact: true }).waitFor();
    assert.equal(await s.page.getByRole('button', { name: 'Жауапты жіберу', exact: true }).count(), 0);
    assert.equal(s.calls.filter(c => c.method !== 'GET').length, 0);
    await audit(s.page, 'draft-preview'); report.checks.push('Draft preview renders real StepContent, no academic writes or submit'); await s.context.close();

    s = await setup(browser, { role: 'ADMIN', closed: true });
    await s.page.goto(origin + '/dashboard/admin/pilot'); await s.page.getByRole('button', { name: 'Тоқтату', exact: true }).waitFor();
    const trigger = s.page.getByRole('button', { name: 'Тоқтату', exact: true }); await trigger.click();
    const dialog = s.page.getByRole('dialog'); await dialog.waitFor();
    await dialog.getByLabel('Себебі (кемінде 3 таңба)').fill('Ойдан шығарылған тексеру себебі');
    assert.equal(await dialog.locator('textarea').getAttribute('maxlength'), '500');
    await audit(s.page, 'reason-dialog'); await s.page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0); assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    await trigger.click(); await s.page.getByRole('dialog').getByLabel('Себебі (кемінде 3 таңба)').fill('Қайта тексеру');
    await s.page.getByRole('dialog').getByRole('button', { name: 'Растау', exact: true }).click(); await s.page.getByRole('dialog').getByRole('alert').waitFor();
    report.checks.push('Pilot dialog reason bounds, Escape/focus return, server error remains visible'); await s.context.close();

    for (const state of ['VALID', 'REVOKED', 'NOT_FOUND', 'UNAVAILABLE']) {
      s = await setup(browser, { verification: state }); await s.page.goto(origin + '/verify/12345678-1234-4123-8123-123456789abc');
      const text = state === 'VALID' ? 'Сертификаттың берілгені расталды' : state === 'REVOKED' ? 'Сертификаттың күші жойылған' : state === 'NOT_FOUND' ? 'Сертификат табылмады' : 'Сертификатты қазір тексеру мүмкін болмады. Қайта көріңіз.';
      await s.page.getByText(text, { exact: true }).waitFor(); report.checks.push(`Verifier ${state} distinct`); await s.context.close();
    }
    for (const width of [320,360,375,390,430,768,1024,1280,1440,1920]) {
      for (const route of ['/auth/register','/courses','/dashboard','/dashboard/courses/fixture-course/learn','/dashboard/teacher/courses/fixture-course/preview','/dashboard/admin/pilot']) {
        s = await setup(browser, { width, role: route.includes('/teacher') ? 'TEACHER' : route.includes('/admin') ? 'ADMIN' : 'STUDENT', closed: route.includes('/admin') });
        await s.page.goto(origin + route); await s.page.waitForLoadState('networkidle');
        const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        report.reflow.push({ width, route, overflow });
        if (width === 390) await s.page.screenshot({ path: path.join(output, route.replaceAll('/', '-') + '.png'), fullPage: true });
        await s.context.close();
      }
    }
    assert.equal(report.reflow.filter(r => r.overflow).length, 0, 'Horizontal page overflow');
    assert.equal(report.axe.flatMap(r => r.violations).filter(v => ['serious','critical'].includes(v.impact)).length, 0, 'Serious accessibility violations');
  } finally { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
  console.log(JSON.stringify({ checks: report.checks, reflow: report.reflow.length, axe: report.axe, browser: report.browser }));
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
