// Run only against the isolated demo stack. This suite creates an exam and real recordings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const { PrismaClient } = require('../../backend/node_modules/@prisma/client');

const root = path.resolve(__dirname, '../..');
const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
const web = 'http://localhost:3000';
const api = 'http://localhost:4000';
if (process.env.E2E_DISPOSABLE !== 'true' || env.NODE_ENV !== 'development' ||
    env.FRONTEND_URL !== web || env.NEXT_PUBLIC_API_URL !== api ||
    env.POSTGRES_DB !== 'proctolearn_local') {
  throw new Error('Stage 9 browser suite requires E2E_DISPOSABLE=true and the isolated localhost demo stack.');
}
const databaseUrl = `postgresql://${encodeURIComponent(env.POSTGRES_USER)}:${encodeURIComponent(env.POSTGRES_PASSWORD)}@127.0.0.1:5433/${env.POSTGRES_DB}`;
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const auditIssues = [];
const browserOptions = { headless: true };
if (process.env.E2E_CHROME_PATH) browserOptions.executablePath = process.env.E2E_CHROME_PATH;

async function login(browser, role, viewport) {
  const context = await browser.newContext({ viewport: viewport || { width: 1365, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${web}/auth/login`);
  await page.getByLabel('Email', { exact: true }).fill(`${role.toLowerCase()}@proctolearn.kz`);
  await page.getByLabel('Пароль', { exact: true }).fill(env[`DEMO_${role}_PASSWORD`]);
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/dashboard', { timeout: 30000 });
  const me = await context.request.get(`${api}/auth/me`);
  assert.equal(me.status(), 200);
  assert.equal((await me.json()).role, role);
  assert.ok((await context.cookies()).some(cookie => cookie.httpOnly && cookie.name === 'pl-access'));
  return { context, page };
}

async function auditPage(page) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const results = await page.evaluate(async () => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  }));
  const failures = results.violations.map(v => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 8).map(n => n.target.join(' ')).join(', ')}`);
  auditIssues.push(...failures.map(failure => `${new URL(page.url()).pathname}: ${failure}`));
}

async function createExam() {
  const [teacher, student, proctor] = await Promise.all(['teacher', 'student', 'proctor'].map(email =>
    prisma.user.findUniqueOrThrow({ where: { email: `${email}@proctolearn.kz` } })));
  const course = await prisma.course.create({ data: {
    title: `E2E браузер ${randomUUID()}`, description: 'Изолированный сценарий этапа 9', teacherId: teacher.id,
    exams: { create: { title: 'E2E экзамен', duration: 10, passScore: 60,
      questions: { create: { text: 'E2E вопрос', type: 'SINGLE_CHOICE', options: ['A', 'B'], answer: 'A' } },
      proctorAssignments: { create: { proctorId: proctor.id } },
    } },
    enrollments: { create: { userId: student.id, examAccessGrantedAt: new Date(), examAccessGrantedBy: teacher.id } },
  }, include: { exams: true } });
  return { examId: course.exams[0].id, studentId: student.id };
}

const fakeCapture = () => {
  const stream = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    const draw = canvas.getContext('2d');
    let frame = 0;
    setInterval(() => {
      draw.fillStyle = frame++ % 2 ? '#4361ee' : '#f72585';
      draw.fillRect(0, 0, 640, 480);
      draw.fillStyle = 'white'; draw.fillText(`E2E frame ${frame}`, 30, 40);
    }, 100);
    return canvas.captureStream(12);
  };
  Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => stream() });
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => stream() });
};

async function main() {
  const ready = await fetch(`${api}/ready`);
  assert.equal(ready.status, 200);
  assert.equal((await fetch('http://localhost:9000/')).status, 403);
  const browser = await chromium.launch(browserOptions);
  const contexts = [];
  const sessions = new Map();
  try {
    for (const [role, route, heading] of [
      ['STUDENT', '/dashboard/courses', 'Курстар'],
      ['TEACHER', '/dashboard/teacher/courses', 'Менің курстарым'],
      ['PROCTOR', '/dashboard/proctor', 'Проктор'],
      ['ADMIN', '/dashboard/admin/users', 'Пайдаланушылар'],
    ]) {
      const session = await login(browser, role);
      contexts.push(session.context);
      sessions.set(role, session);
      await session.page.goto(web + route);
      await session.page.getByRole('heading', { name: heading }).first().waitFor();
      await auditPage(session.page);
      assert.equal(await session.page.evaluate(() => localStorage.getItem('accessToken')), null);
      if (role !== 'ADMIN') assert.equal((await session.context.request.get(`${api}/admin/audit`)).status(), 403);
      console.log(`PASS role ${role}: browser, API and private cookie`);
    }

    const mobile = sessions.get('STUDENT');
    await mobile.page.setViewportSize({ width: 390, height: 844 });
    await mobile.page.goto(`${web}/dashboard/courses`);
    await mobile.page.getByRole('heading', { name: 'Курстар' }).waitFor();
    assert.ok(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await mobile.page.getByRole('button', { name: 'Мәзірді ашу' }).click();
    assert.equal(await mobile.page.getByRole('button', { name: 'Мәзірді жабу' }).getAttribute('aria-expanded'), 'true');
    await mobile.page.getByRole('link', { name: 'Хабарландырулар' }).last().click();
    await mobile.page.waitForURL('**/dashboard/notifications');
    assert.ok(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await auditPage(mobile.page);
    await mobile.page.setViewportSize({ width: 768, height: 1024 });
    await mobile.page.goto(`${web}/dashboard/courses`);
    await mobile.page.getByRole('heading', { name: 'Курстар' }).waitFor();
    assert.ok(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await mobile.page.setViewportSize({ width: 390, height: 844 });
    console.log('PASS mobile navigation, width and WCAG A/AA automated checks');

    const course = mobile.page.getByRole('button', { name: /Курсқа тіркелу/ }).first();
    await course.focus();
    await mobile.page.keyboard.press('Enter');
    const dialog = mobile.page.getByRole('dialog', { name: 'Курсқа тіркелу' });
    await dialog.waitFor();
    assert.equal(await mobile.page.evaluate(() => document.activeElement?.textContent?.trim()), 'Болдырмау');
    await auditPage(mobile.page);
    await mobile.page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    assert.deepEqual(auditIssues, []);
    console.log('PASS keyboard course card and accessible enrollment dialog');

    const fixture = await createExam();
    const studentContext = mobile.context;
    const deniedPage = await studentContext.newPage();
    await deniedPage.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true,
        value: async () => { throw new DOMException('Permission denied', 'NotAllowedError'); } });
    });
    await deniedPage.goto(`${web}/dashboard/exam/${fixture.examId}`);
    await deniedPage.getByRole('button', { name: /Камера мен экранды қосып/ }).click();
    await deniedPage.getByRole('alert').getByText(/рұқсат берілмеді/).waitFor();
    assert.equal(await prisma.attempt.count({ where: { examId: fixture.examId } }), 0);
    console.log('PASS denied screen permission does not start timed attempt');

    await deniedPage.close();
    const studentPage = await studentContext.newPage();
    await studentPage.setViewportSize({ width: 1365, height: 900 });
    await studentPage.addInitScript(fakeCapture);
    let droppedChunk = false;
    let failFinalChunk = false;
    await studentPage.route('**/evidence/uploads/*/chunks/*', async route => {
      if (failFinalChunk && !droppedChunk) { droppedChunk = true; await route.abort('failed'); }
      else await route.continue();
    });
    await studentPage.goto(`${web}/dashboard/exam/${fixture.examId}`);
    await studentPage.getByRole('button', { name: /Камера мен экранды қосып/ }).click();
    await studentPage.getByRole('heading', { name: 'E2E вопрос' }).waitFor({ timeout: 30000 });
    const attempt = await prisma.attempt.findFirstOrThrow({ where: { examId: fixture.examId, userId: fixture.studentId } });
    let dropped = false;
    await studentPage.route('**/attempts/*/draft', async route => {
      if (route.request().method() === 'PATCH' && !dropped) { dropped = true; await route.abort('failed'); }
      else await route.continue();
    });
    await studentPage.getByLabel('A', { exact: true }).check();
    await studentPage.getByText('Байланыс жоқ: соңғы өзгерістер сақталмады').waitFor({ timeout: 20000 });
    assert.equal(await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id }, select: { draftRevision: true } }).then(a => a.draftRevision), 0);
    await studentPage.unroute('**/attempts/*/draft');
    await studentPage.getByRole('status').getByRole('button', { name: 'Қайта сақтау' }).click();
    await studentPage.getByText('Жауаптар серверде сақталды').waitFor({ timeout: 20000 });
    console.log('PASS lost draft request keeps the answer and retries after network recovery');
    await studentPage.waitForTimeout(2500);
    failFinalChunk = true;
    await studentPage.getByRole('button', { name: 'Жауаптарды жіберу' }).click();
    await studentPage.getByRole('heading', { name: 'Жауаптар қабылданды' }).waitFor({ timeout: 60000 });
    const deadline = Date.now() + 60000;
    let evidence = [];
    let retriedUpload = false;
    while (Date.now() < deadline) {
      evidence = await prisma.evidenceFile.findMany({ where: { attemptId: attempt.id } });
      if (evidence.some(e => e.type === 'recording_camera') && evidence.some(e => e.type === 'recording_screen')) break;
      const retry = studentPage.getByRole('button', { name: 'Жазбаларды қайта жүктеу' });
      if (await retry.count() && await retry.isVisible() && await retry.isEnabled()) {
        await retry.click();
        retriedUpload = true;
      }
      await studentPage.waitForTimeout(1000);
    }
    if (!evidence.some(e => e.type === 'recording_camera') || !evidence.some(e => e.type === 'recording_screen')) {
      const uploads = await prisma.recordingUpload.findMany({ where: { attemptId: attempt.id }, select: { kind: true, state: true, bytes: true } });
      throw new Error(`Browser recordings did not complete after retry: ${JSON.stringify(uploads)}`);
    }
    assert.equal(droppedChunk, true, 'one chunk upload must fail before the successful retry');
    console.log(`PASS dropped video chunk recovered ${retriedUpload ? 'with visible retry control' : 'automatically'}`);
    const proctor = sessions.get('PROCTOR');
    const evidenceResponse = await proctor.context.request.get(`${api}/evidence/${attempt.id}`);
    assert.equal(evidenceResponse.status(), 200);
    const playable = await evidenceResponse.json();
    for (const kind of ['recording_camera', 'recording_screen']) {
      const entry = playable.find(item => item.type === kind && item.state === 'AVAILABLE');
      assert.ok(entry?.url, `${kind} must have a signed playback URL`);
      const recording = await proctor.context.request.get(entry.url);
      assert.equal(recording.status(), 200);
      const bytes = await recording.body();
      assert.ok(bytes.length > 4);
      assert.equal(bytes.subarray(0, 4).toString('hex'), '1a45dfa3');
    }
    await proctor.page.goto(`${web}/dashboard/proctor/evidence/${attempt.id}`);
    await proctor.page.getByText('Камера', { exact: true }).first().waitFor();
    await proctor.page.getByText('Экран', { exact: true }).first().waitFor();
    console.log('PASS real browser capture -> API -> PostgreSQL -> S3 -> proctor UI');
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    await browser.close();
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
