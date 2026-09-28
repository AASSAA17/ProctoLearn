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
    const publicPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await publicPage.goto(web);
    await publicPage.locator('#courses').getByRole('heading', { name: 'Курстар', exact: true }).waitFor();
    assert.ok(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.equal(await publicPage.getByText('1 000+').count(), 0);
    await publicPage.close();
    console.log('PASS public landing width and verified-only content');

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

    for (const role of ['TEACHER', 'PROCTOR', 'ADMIN']) {
      const { context, page } = sessions.get(role);
      await page.goto(`${web}/dashboard`);
      await page.getByRole('main').getByRole('heading').first().waitFor();
      const nav = page.getByRole('navigation', { name: 'Негізгі навигация' });
      for (const label of ['Курстар', 'Нәтижелер', 'Сертификаттар']) {
        assert.equal(await nav.getByRole('link', { name: label, exact: true }).count(), 0, `${role}: ${label}`);
      }
      assert.equal((await context.request.get(`${api}/enrollments/my`)).status(), 403);
      assert.equal((await context.request.post(`${api}/enrollments/courses/not-a-course`)).status(), 403);
      await page.goto(`${web}/dashboard/courses`);
      await page.getByRole('alert').getByText('Бұл бөлім сіздің рөліңізге қолжетімсіз.').waitFor();
    }
    console.log('PASS staff workspaces hide student tools and enrollment API rejects staff');

    for (const [role, route, heading] of [
      ['STUDENT', '/dashboard/profile', 'Менің профилім'],
      ['STUDENT', '/dashboard/my-attempts', 'Менің нәтижелерім'],
      ['STUDENT', '/dashboard/certificates', 'Менің сертификаттарым'],
      ['TEACHER', '/dashboard/teacher/courses/new', 'Жаңа курс жасау'],
      ['ADMIN', '/dashboard/teacher/courses', 'Барлық курстар'],
      ['PROCTOR', '/dashboard/proctor', 'Проктор панелі'],
      ['ADMIN', '/dashboard/admin', 'Админ панелі'],
      ['ADMIN', '/dashboard/admin/courses', 'Курстар статистикасы'],
      ['ADMIN', '/dashboard/admin/users', 'Пайдаланушылар'],
      ['ADMIN', '/dashboard/admin/online', /Онлайн пайдаланушылар/],
      ['ADMIN', '/dashboard/admin/audit', 'Әрекеттер журналы'],
    ]) {
      const page = sessions.get(role).page;
      await page.goto(web + route);
      await page.getByRole('heading', { name: heading, exact: typeof heading === 'string' }).first().waitFor();
      await auditPage(page);
    }
    for (const role of ['STUDENT', 'TEACHER', 'PROCTOR', 'ADMIN']) {
      const page = sessions.get(role).page;
      await page.goto(`${web}/dashboard/notifications`);
      await page.getByRole('heading', { name: 'Хабарландырулар', exact: true }).waitFor();
      await auditPage(page);
    }
    assert.deepEqual(auditIssues, []);
    console.log('PASS role pages, profile, inbox and administration smoke with WCAG A/AA');

    const adminPage = sessions.get('ADMIN').page;
    await adminPage.goto(`${web}/dashboard/admin/users`);
    await adminPage.getByRole('row').filter({ hasText: 'student@proctolearn.kz' }).getByRole('button', { name: '🎓 Рұқсат' }).waitFor();
    for (const role of ['teacher', 'proctor', 'admin']) {
      assert.equal(await adminPage.getByRole('row').filter({ hasText: `${role}@proctolearn.kz` }).getByRole('button', { name: '🎓 Рұқсат' }).count(), 0);
    }
    const courseForGrant = await prisma.course.findFirstOrThrow();
    const csrfResponse = await sessions.get('ADMIN').context.request.get(`${api}/auth/csrf`);
    assert.equal(csrfResponse.status(), 200);
    const csrfToken = (await csrfResponse.json()).csrfToken;
    for (const role of ['TEACHER', 'PROCTOR', 'ADMIN']) {
      const staff = await prisma.user.findUniqueOrThrow({ where: { email: `${role.toLowerCase()}@proctolearn.kz` } });
      const before = await prisma.enrollment.count({ where: { userId: staff.id, courseId: courseForGrant.id } });
      for (const action of ['grant-exam-access', 'grant-certificate']) {
        const response = await sessions.get('ADMIN').context.request.post(`${api}/admin/users/${staff.id}/${action}/${courseForGrant.id}`, {
          headers: { Origin: web, 'X-CSRF-Token': csrfToken },
        });
        assert.equal(response.status(), 403, `${role}: ${action}`);
      }
      assert.equal(await prisma.enrollment.count({ where: { userId: staff.id, courseId: courseForGrant.id } }), before);
    }
    console.log('PASS admin grant controls and API accept students only');

    let coursesUnavailable = true;
    const interceptCourses = async (request) => {
      if (coursesUnavailable) await request.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' });
      else await request.continue();
    };
    await adminPage.route('**/courses', interceptCourses);
    await adminPage.goto(`${web}/dashboard/admin/users`);
    await adminPage.getByRole('row').filter({ hasText: 'student@proctolearn.kz' }).getByRole('button', { name: '🎓 Рұқсат' }).click();
    await adminPage.getByRole('alert').getByText('Курстарды жүктеу мүмкін болмады.').waitFor();
    coursesUnavailable = false;
    await adminPage.getByRole('alert').getByRole('button', { name: 'Қайта жүктеу' }).click();
    await adminPage.getByRole('alert').filter({ hasText: 'Курстарды жүктеу мүмкін болмады.' }).waitFor({ state: 'hidden' });
    assert.ok(await adminPage.getByLabel('Курс', { exact: true }).selectOption({ index: 1 }));
    await adminPage.getByRole('button', { name: 'Болдырмау' }).click();
    await adminPage.unroute('**/courses', interceptCourses);
    console.log('PASS admin grant course picker recovers from API outage');

    for (const role of ['TEACHER', 'ADMIN']) {
      const page = sessions.get(role).page;
      const requestPromise = page.waitForRequest(request => new URL(request.url()).pathname === '/courses' && new URL(request.url()).searchParams.has('limit'));
      await page.goto(`${web}/dashboard/teacher/courses`);
      const query = new URL((await requestPromise).url()).searchParams;
      assert.equal(query.get('teacherId'), role === 'TEACHER' ? (await prisma.user.findUniqueOrThrow({ where: { email: 'teacher@proctolearn.kz' } })).id : null);
      await page.getByRole('heading', { name: role === 'ADMIN' ? 'Барлық курстар' : 'Менің курстарым' }).waitFor();
      assert.equal(await page.locator('a[href^="/dashboard/courses/"]').count(), 0, `${role} must not receive blocked student links`);
    }
    console.log('PASS teacher sees owned courses while admin sees the full catalog');

    const courseTitle = `E2E teacher course ${randomUUID()}`;
    const moduleTitle = `E2E module ${randomUUID()}`;
    const lessonTitle = `E2E lesson ${randomUUID()}`;
    try {
      const teacherPage = sessions.get('TEACHER').page;
      await teacherPage.goto(`${web}/dashboard/teacher/courses/new`);
      await teacherPage.getByLabel('Курс атауы').fill(courseTitle);
      await teacherPage.getByLabel('Сипаттама').fill('Isolated browser authoring check');
      await teacherPage.getByLabel('Деңгей').selectOption('INTERMEDIATE');
      await teacherPage.getByRole('button', { name: 'Курс жасау →' }).click();
      await teacherPage.waitForURL(/\/dashboard\/teacher\/courses\/[^/]+\/edit$/);
      assert.equal(await teacherPage.locator('a[href^="/dashboard/courses/"]').count(), 0);
      await auditPage(teacherPage);
      assert.deepEqual(auditIssues, []);
      const saved = await prisma.course.findFirstOrThrow({ where: { title: courseTitle } });
      assert.equal(saved.level, 'INTERMEDIATE');
      assert.equal(saved.teacherId, (await prisma.user.findUniqueOrThrow({ where: { email: 'teacher@proctolearn.kz' } })).id);
      assert.equal((await sessions.get('PROCTOR').context.request.post(`${api}/courses`, { data: { title: 'Forbidden' } })).status(), 403);
      await teacherPage.getByRole('button', { name: '+ Бөлім қосу' }).click();
      await teacherPage.getByRole('textbox', { name: 'Бөлім атауы' }).fill(moduleTitle);
      await teacherPage.getByRole('button', { name: 'Бөлімді қосу' }).click();
      await teacherPage.getByText(`1. ${moduleTitle}`).waitFor();
      const savedModule = await prisma.courseModule.findFirstOrThrow({ where: { courseId: saved.id, title: moduleTitle } });
      assert.equal(savedModule.title, moduleTitle);

      await teacherPage.getByRole('button', { name: '+ Сабақ қосу' }).click();
      await teacherPage.getByRole('textbox', { name: 'Сабақ атауы' }).fill(lessonTitle);
      await teacherPage.getByRole('button', { name: 'Қосу', exact: true }).click();
      await teacherPage.getByText(lessonTitle).first().waitFor();
      assert.equal((await prisma.lesson.findFirstOrThrow({ where: { title: lessonTitle } })).moduleId, savedModule.id);

      teacherPage.once('dialog', dialog => dialog.accept());
      await teacherPage.getByRole('button', { name: `Сабақты жою: ${lessonTitle}` }).click();
      await teacherPage.getByRole('button', { name: `Сабақты жою: ${lessonTitle}` }).waitFor({ state: 'hidden' });
      assert.equal(await prisma.lesson.count({ where: { title: lessonTitle } }), 0);

      teacherPage.once('dialog', dialog => dialog.accept());
      await teacherPage.getByText(`1. ${moduleTitle}`).locator('..').getByRole('button', { name: 'Жою' }).click();
      await teacherPage.getByText(`1. ${moduleTitle}`).waitFor({ state: 'hidden' });
      assert.equal(await prisma.courseModule.count({ where: { courseId: saved.id, title: moduleTitle } }), 0);

      await teacherPage.goto(`${web}/dashboard/teacher/courses`);
      await teacherPage.getByText(courseTitle).first().waitFor();
      teacherPage.once('dialog', dialog => dialog.accept());
      await teacherPage.getByRole('button', { name: `Курсты жою: ${courseTitle}` }).click();
      await teacherPage.getByText(courseTitle).waitFor({ state: 'hidden' });
      assert.equal(await prisma.course.count({ where: { id: saved.id } }), 0);
      console.log('PASS teacher creates and deletes course structure; proctor cannot author');
    } finally {
      const created = await prisma.course.findFirst({ where: { title: courseTitle } });
      if (created) await prisma.course.delete({ where: { id: created.id } });
    }

    for (const [role, route, endpoint] of [
      ['TEACHER', '/dashboard/teacher/courses', '/courses'],
      ['PROCTOR', '/dashboard/proctor', '/attempts'],
    ]) {
      const page = sessions.get(role).page;
      let fail = true;
      const matches = url => url.pathname === endpoint && (role === 'PROCTOR' || url.searchParams.has('teacherId'));
      const intercept = async (request) => {
        if (fail) await request.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' });
        else await request.continue();
      };
      await page.route(matches, intercept);
      await page.goto(web + route);
      await page.getByRole('alert').getByText('Деректерді жүктеу мүмкін болмады.').waitFor();
      assert.equal(await page.getByText(role === 'PROCTOR' ? 'Талпыныс жоқ' : 'Әзірге курстар жоқ').count(), 0);
      fail = false;
      await page.getByRole('button', { name: 'Қайта жүктеу' }).click();
      await page.getByRole('alert').filter({ hasText: 'Деректерді жүктеу мүмкін болмады.' }).waitFor({ state: 'hidden' });
      await page.unroute(matches, intercept);
    }
    console.log('PASS teacher and proctor load failures recover on retry');

    for (const [role, route, endpoint, readyText] of [
      ['STUDENT', '/dashboard', '/enrollments/my', 'Белсенді курс'],
      ['STUDENT', '/dashboard/my-attempts', '/attempts/my', 'Менің нәтижелерім'],
      ['STUDENT', '/dashboard/certificates', '/certificates/my', 'Менің сертификаттарым'],
      ['ADMIN', '/dashboard/admin', '/admin/stats', 'Жалпы статистика және басқару'],
      ['ADMIN', '/dashboard/admin/courses', '/admin/courses/stats', 'Курстар статистикасы'],
      ['ADMIN', '/dashboard/admin/online', '/admin/users/online', /Онлайн пайдаланушылар/],
      ['ADMIN', '/dashboard/admin/users', '/admin/users', 'Пайдаланушылар'],
    ]) {
      const page = sessions.get(role).page;
      let fail = true;
      const intercept = async (request) => {
        if (fail) await request.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' });
        else await request.continue();
      };
      const matches = url => url.pathname === endpoint;
      await page.route(matches, intercept);
      await page.goto(web + route);
      await page.getByRole('alert').getByText('Деректерді жүктеу мүмкін болмады.').waitFor();
      assert.equal(await page.getByText('Курстар жоқ').count(), 0);
      fail = false;
      await page.getByRole('button', { name: 'Қайта жүктеу' }).click();
      await page.getByRole('alert').filter({ hasText: 'Деректерді жүктеу мүмкін болмады.' }).waitFor({ state: 'hidden' });
      await page.getByText(readyText, { exact: typeof readyText === 'string' }).first().waitFor();
      await page.unroute(matches, intercept);
    }
    console.log('PASS dashboard, certificates and admin load failures recover on retry');

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
