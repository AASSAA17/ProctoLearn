// Run only against the isolated demo stack. This suite creates an exam and real recordings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const { PrismaClient } = require('../../backend/node_modules/@prisma/client');

const root = path.resolve(__dirname, '../..');
const profile = process.env.E2E_ENV_FILE ? path.resolve(process.env.E2E_ENV_FILE) : path.join(root, '.env.local');
const releaseProfile = path.join(root, '.local', 'release-demo', '.env.local');
if (profile !== path.join(root, '.env.local') && profile !== releaseProfile) throw new Error('Unrecognized E2E private environment profile');
if (profile === releaseProfile && (fs.lstatSync(path.dirname(profile)).isSymbolicLink() || JSON.parse(fs.readFileSync(path.join(path.dirname(profile), 'ownership.json'), 'utf8')).kind !== 'proctolearn-isolated-release-v1')) throw new Error('Release ownership marker mismatch');
const env = parseEnv(fs.readFileSync(profile, 'utf8'));
const privateAccounts = profile === releaseProfile ? JSON.parse(fs.readFileSync(path.join(path.dirname(profile), 'accounts.json'), 'utf8')) : [];
function account(role) {
  const normalized = role.toUpperCase();
  const selected = privateAccounts.find(item => item.role === normalized);
  if (profile === releaseProfile && !selected) throw new Error('Release role account missing');
  return selected ?? { email: `${normalized.toLowerCase()}@proctolearn.kz`, password: env[`DEMO_${normalized}_PASSWORD`] };
}
const web = 'http://localhost:3000';
const api = 'http://localhost:4000';
if (process.env.E2E_DISPOSABLE !== 'true' || env.NODE_ENV !== 'development' ||
    env.FRONTEND_URL !== web || env.NEXT_PUBLIC_API_URL !== api ||
    env.POSTGRES_DB !== (profile === releaseProfile ? 'proctolearn_release' : 'proctolearn_local')) {
  throw new Error('Stage 9 browser suite requires E2E_DISPOSABLE=true and the isolated localhost demo stack.');
}
const databaseUrl = `postgresql://${encodeURIComponent(env.POSTGRES_USER)}:${encodeURIComponent(env.POSTGRES_PASSWORD)}@127.0.0.1:5433/${env.POSTGRES_DB}`;
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const auditIssues = [];
const createdFixtureCourses = new Set();
const browserOptions = { headless: true };
if (process.env.E2E_CHROME_PATH) browserOptions.executablePath = process.env.E2E_CHROME_PATH;

async function login(browser, role, viewport) {
  const context = await browser.newContext({ viewport: viewport || { width: 1365, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${web}/auth/login`);
  await page.getByLabel('Email', { exact: true }).fill(account(role).email);
  await page.getByLabel('Пароль', { exact: true }).fill(account(role).password);
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

async function publishCourse(context, courseId) {
  const csrf = await context.request.get(`${api}/auth/csrf`);
  assert.equal(csrf.status(), 200);
  const response = await context.request.post(`${api}/courses/${courseId}/publish`, {
    headers: { Origin: web, 'X-CSRF-Token': (await csrf.json()).csrfToken },
  });
  assert.equal(response.status(), 201, await response.text());
}

async function createPublicCatalogFixture(context) {
  const csrf = await context.request.get(`${api}/auth/csrf`);
  assert.equal(csrf.status(), 200);
  const headers = { Origin: web, 'X-CSRF-Token': (await csrf.json()).csrfToken };
  const created = await context.request.post(`${api}/courses`, { headers, data: {
    title: `E2E public catalog ${randomUUID()}`,
    description: 'Isolated public catalog fixture: introduction to HTML headings for beginning learners.',
    level: 'BEGINNER',
  } });
  assert.equal(created.status(), 201);
  const course = await created.json();
  createdFixtureCourses.add(course.id);
  assert.equal(course.status, 'DRAFT');
  assert.equal((await fetch(`${api}/courses/${course.id}`)).status, 404);
  const lesson = await context.request.post(`${api}/courses/${course.id}/lessons`, { headers, data: {
    title: 'HTML heading introduction',
    content: 'A page heading describes its main topic. Use an h1 element for the main heading and h2 elements for sections.',
    order: 1,
  } });
  assert.equal(lesson.status(), 201);
  await publishCourse(context, course.id);
  assert.equal((await fetch(`${api}/courses/${course.id}`)).status, 200);
  console.log('PASS owned catalog fixture created as draft and explicitly published through author API');
}

async function createExam(teacherContext) {
  const [teacher, student, proctor] = await Promise.all(['teacher', 'student', 'proctor'].map(email =>
    prisma.user.findUniqueOrThrow({ where: { email: account(email).email } })));
  const course = await prisma.course.create({ data: {
    title: `E2E браузер ${randomUUID()}`, description: 'Изолированный сценарий этапа 9', teacherId: teacher.id,
    lessons: { create: { title: 'E2E fixture preparation', content: 'Explicitly seeded browser test material', order: 1 } },
    exams: { create: { title: 'E2E экзамен', duration: 10, passScore: 60,
      questions: { create: { text: 'E2E вопрос', type: 'SINGLE_CHOICE', options: ['A', 'B'], answer: 'A' } },
      proctorAssignments: { create: { proctorId: proctor.id } },
    } },
    enrollments: { create: { userId: student.id, examAccessGrantedAt: new Date(), examAccessGrantedBy: teacher.id } },
  }, include: { exams: true } });
  createdFixtureCourses.add(course.id);
  await publishCourse(teacherContext, course.id);
  return { examId: course.exams[0].id, studentId: student.id };
}

async function archiveFixtureCourses(context) {
  if (!context) return;
  const teacher = await prisma.user.findUniqueOrThrow({ where: { email: account('TEACHER').email } });
  // The owned release retains recordings and enrollments; hide only positively identified
  // synthetic stage9 courses from the public catalog, including prior runs of this suite.
  if (profile === releaseProfile) {
    const prior = await prisma.course.findMany({ where: { teacherId: teacher.id, status: 'PUBLISHED',
      description: { in: ['Isolated keyboard enrollment check', 'Изолированный сценарий этапа 9'] },
    }, select: { id: true, title: true, description: true } });
    for (const row of prior) {
      const prefix = row.description === 'Isolated keyboard enrollment check' ? 'E2E keyboard enrollment ' : 'E2E браузер ';
      if (row.title.startsWith(prefix) && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.title.slice(prefix.length))) createdFixtureCourses.add(row.id);
    }
  }
  const csrf = await context.request.get(`${api}/auth/csrf`);
  assert.equal(csrf.status(), 200);
  const headers = { Origin: web, 'X-CSRF-Token': (await csrf.json()).csrfToken };
  for (const id of createdFixtureCourses) {
    const response = await context.request.post(`${api}/courses/${id}/archive`, { headers });
    assert.equal(response.status(), 201);
    assert.equal((await fetch(`${api}/courses/${id}`)).status, 404);
  }
  console.log(`PASS archived ${createdFixtureCourses.size} identified stage9 course fixtures through owner API; history retained`);
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

async function verifyProctorFeed(proctor, studentPage, attempt) {
  const sessionPath = `/proctor/sessions/${attempt.id}`;
  const matches = url => url.pathname === sessionPath;
  let mode = 'fail';
  let captureSnapshot;
  let releaseSnapshot;
  const captured = new Promise(resolve => { captureSnapshot = resolve; });
  const released = new Promise(resolve => { releaseSnapshot = resolve; });
  const intercept = async route => {
    if (mode === 'fail') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' });
    if (mode === 'hold') {
      const response = await route.fetch();
      const snapshot = await response.json();
      captureSnapshot(snapshot);
      await released;
      return route.fulfill({ response, json: snapshot });
    }
    return route.continue();
  };
  await proctor.page.route(matches, intercept);
  try {
    await proctor.page.goto(`${web}/dashboard/proctor`);
    const card = proctor.page.getByRole('article').filter({ has: proctor.page.locator(`a[href="/dashboard/proctor/evidence/${attempt.id}"]`) });
    await card.getByRole('button', { name: /оқиғаларды көру/ }).click();
    const feed = proctor.page.getByRole('region', { name: 'Нақты уақыт оқиғалары' });
    await feed.getByText('Тікелей байланыс қосылды', { exact: true }).waitFor();
    await feed.getByRole('alert').waitFor();
    assert.equal(await feed.getByText('Оқиға жоқ', { exact: true }).count(), 0);
    mode = 'pass';
    await feed.getByRole('button', { name: 'Қайта жүктеу' }).click();
    await feed.getByRole('alert').waitFor({ state: 'hidden' });
    await feed.getByText('Оқиғалар жүктелуде...', { exact: true }).waitFor({ state: 'hidden' });

    await studentPage.addScriptTag({ path: path.join(root, 'frontend/node_modules/socket.io-client/dist/socket.io.min.js') });
    await studentPage.evaluate(({ api, attemptId }) => new Promise((resolve, reject) => {
      const socket = window.proctorFeedTestSocket = window.io(`${api}/proctor`, { transports: ['websocket'], withCredentials: true, forceNew: true });
      const timeout = setTimeout(() => reject(new Error('Student event socket did not join')), 10000);
      socket.on('connect', () => socket.emit('proctor:start', { attemptId, role: 'student' }));
      socket.once('proctor:started', () => { clearTimeout(timeout); resolve(); });
    }), { api, attemptId: attempt.id });
    const emitEvent = type => studentPage.evaluate(({ attemptId, type }) => new Promise((resolve, reject) => {
      const socket = window.proctorFeedTestSocket;
      const listener = payload => {
        if (payload.event.attemptId !== attemptId || payload.event.type !== type) return;
        clearTimeout(timeout); socket.off('proctor:event:recorded', listener); resolve(payload);
      };
      const timeout = setTimeout(() => { socket.off('proctor:event:recorded', listener); reject(new Error('Student event was not recorded')); }, 10000);
      socket.on('proctor:event:recorded', listener);
      socket.emit('proctor:event', { attemptId, type });
    }), { attemptId: attempt.id, type });
    await emitEvent('copy_paste');
    await feed.getByText('⚠️ Көшіру/қою', { exact: true }).waitFor();

    mode = 'hold';
    await feed.getByRole('button', { name: 'Оқиғаларды жаңарту' }).click();
    await Promise.race([captured, new Promise((_, reject) => setTimeout(() => reject(new Error('Summary snapshot was not captured')), 10000))]);
    const live = await emitEvent('paste');
    await feed.getByText('⚠️ Қою', { exact: true }).waitFor();
    releaseSnapshot();
    await feed.getByText('Оқиғалар жүктелуде...', { exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await feed.getByText('⚠️ Қою', { exact: true }).count(), 1);
    assert.equal(await feed.getByText('⚠️ Көшіру/қою', { exact: true }).count(), 1);
    const displayedTrust = Number((await card.getByText(/Сенімділік:/).innerText()).split(':').at(-1).trim());
    assert.ok(displayedTrust <= live.trustScore, 'stale HTTP snapshot cannot restore a deducted trust score');
    mode = 'pass';
    await feed.getByRole('button', { name: 'Оқиғаларды жаңарту' }).click();
    await feed.getByText('Оқиғалар жүктелуде...', { exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await feed.getByText('⚠️ Қою', { exact: true }).count(), 1);
    await auditPage(proctor.page);
    assert.deepEqual(auditIssues, []);
    console.log('PASS proctor feed retries failed history and preserves live events/trust across delayed snapshots');
  } finally {
    releaseSnapshot();
    await proctor.page.unroute(matches, intercept);
    await studentPage.evaluate(() => window.proctorFeedTestSocket?.disconnect()).catch(() => {});
  }
}

async function verifyTeacherSteps(page, lessonId) {
  const cases = [
    { type: 'TEXT', field: 'Мәтін мазмұны', value: '<p>Original lesson text</p>', updated: '<p>Edited lesson text</p>' },
    { type: 'VIDEO', field: 'Бейне сілтемесі', value: 'https://example.invalid/lesson', updated: '/demo/html-structure.webm' },
    { type: 'TASK', taskType: 'single_choice', button: '○ Бір жауап' },
    { type: 'TASK', taskType: 'multiple_choice', button: '☑ Бірнеше жауап' },
    { type: 'TASK', taskType: 'text_input', button: 'Аа Мәтін жауабы', value: 'Initial answer', updated: 'Edited answer' },
    { type: 'TASK', taskType: 'number_input', button: '# Сан жауабы', value: '2.5', updated: '-3.75' },
  ];
  for (const [index, item] of cases.entries()) {
    const order = index + 1;
    await page.getByRole('button', { name: '+ Қадам қосу', exact: true }).click();
    const form = page.getByRole('form', { name: 'Қадам редакторы' });
    await form.getByRole('button', { name: { TEXT: '📝 Мәтін', VIDEO: '▶️ Бейне', TASK: '✏️ Тапсырма' }[item.type], exact: true }).click();
    await form.getByLabel('Қадам реті', { exact: true }).fill(String(order));
    if (item.field) await form.getByLabel(item.field, { exact: true }).fill(item.value);
    else {
      await form.getByRole('button', { name: item.button, exact: true }).click();
      await form.getByLabel('Тапсырма сұрағы', { exact: true }).fill(`Question ${item.taskType}`);
      if (item.taskType.endsWith('_choice')) {
        await form.getByLabel('Жауап нұсқасы 1', { exact: true }).fill('A, B');
        await form.getByLabel('Жауап нұсқасы 2', { exact: true }).fill('C');
        if (item.taskType === 'single_choice') {
          const before = await prisma.step.count({ where: { lessonId } });
          await form.getByRole('button', { name: 'Қосу', exact: true }).click();
          await form.getByRole('alert').getByText('Дұрыс жауапты белгілеңіз.').waitFor();
          assert.equal(await prisma.step.count({ where: { lessonId } }), before);
        }
        await form.getByLabel('Дұрыс жауап: 1-нұсқа', { exact: true }).check();
        if (item.taskType === 'multiple_choice') {
          await form.getByRole('button', { name: '+ Нұсқа қосу' }).click();
          await form.getByLabel('Жауап нұсқасы 3', { exact: true }).fill('D');
          await form.getByLabel('Дұрыс жауап: 3-нұсқа', { exact: true }).check();
          await form.getByRole('button', { name: 'Нұсқаны жою: 2', exact: true }).click();
          assert.equal(await form.getByLabel('Дұрыс жауап: 2-нұсқа', { exact: true }).isChecked(), true);
        }
      } else await form.getByLabel('Дұрыс жауап', { exact: true }).fill(item.value);
    }
    const createdResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/lessons/${lessonId}/steps` && response.request().method() === 'POST');
    await form.getByRole('button', { name: 'Қосу', exact: true }).click();
    const created = await createdResponse;
    assert.equal(created.status(), 201);
    const step = await created.json();
    await page.getByRole('button', { name: `Қадамды өңдеу: ${order}`, exact: true }).click();
    if (item.field) {
      assert.equal(await form.getByLabel(item.field, { exact: true }).inputValue(), item.value);
      await form.getByLabel(item.field, { exact: true }).fill(item.updated);
    } else if (item.taskType.endsWith('_choice')) {
      assert.equal(await form.getByLabel('Дұрыс жауап: 1-нұсқа', { exact: true }).isChecked(), true);
      await form.getByLabel('Жауап нұсқасы 1', { exact: true }).fill('A, B edited');
    } else await form.getByLabel('Дұрыс жауап', { exact: true }).fill(item.updated);
    if (item.type === 'TEXT') {
      await page.route(`**/steps/${step.id}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' }));
      await form.getByRole('button', { name: 'Жаңарту', exact: true }).click();
      await form.getByRole('alert').waitFor();
      assert.equal(await form.getByLabel(item.field, { exact: true }).inputValue(), item.updated);
      assert.equal((await prisma.step.findUniqueOrThrow({ where: { id: step.id } })).content.html, item.value);
      await page.unroute(`**/steps/${step.id}`);
    }
    if (item.taskType === 'multiple_choice') {
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await auditPage(page);
      assert.deepEqual(auditIssues, []);
    }
    const updatedResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/steps/${step.id}` && response.request().method() === 'PATCH');
    await form.getByRole('button', { name: 'Жаңарту', exact: true }).click();
    assert.equal((await updatedResponse).status(), 200);
    await form.waitFor({ state: 'hidden' });
    const saved = await prisma.step.findUniqueOrThrow({ where: { id: step.id } });
    assert.equal(saved.type, item.type);
    if (item.type === 'TEXT') assert.equal(saved.content.html, item.updated);
    else if (item.type === 'VIDEO') assert.equal(saved.content.videoUrl, item.updated);
    else {
      assert.equal(saved.content.taskType, item.taskType);
      assert.deepEqual(saved.content.correctAnswer, item.taskType === 'multiple_choice' ? ['A, B edited', 'D'] : item.taskType === 'single_choice' ? 'A, B edited' : item.updated);
    }
    await page.reload();
    await page.getByRole('button', { name: `Қадамды өңдеу: ${order}`, exact: true }).click();
    if (item.field) assert.equal(await form.getByLabel(item.field, { exact: true }).inputValue(), item.updated);
    else if (item.taskType.endsWith('_choice')) assert.equal(await form.getByLabel('Дұрыс жауап: 1-нұсқа', { exact: true }).isChecked(), true);
    else assert.equal(await form.getByLabel('Дұрыс жауап', { exact: true }).inputValue(), item.updated);
    await form.getByLabel('Қадам реті', { exact: true }).fill('99');
    await form.getByRole('button', { name: 'Болдырмау', exact: true }).click();
    assert.equal((await prisma.step.findUniqueOrThrow({ where: { id: step.id } })).order, order);
    await page.setViewportSize({ width: 1365, height: 900 });
  }
  console.log('PASS teacher creates/edits every step/task type, preserves comma answers, retries failed saves and cancels drafts');
}

async function verifyOutlineSettings(page, proctorContext, module, lesson) {
  const csrfResponse = await proctorContext.request.get(`${api}/auth/csrf`);
  assert.equal(csrfResponse.status(), 200);
  const csrfToken = (await csrfResponse.json()).csrfToken;
  const updates = {};
  const stepsBefore = await prisma.step.findMany({ where: { lessonId: lesson.id }, orderBy: { id: 'asc' } });
  for (const { kind, label, item, model, order } of [
    { kind: 'module', label: 'Бөлім', item: module, model: prisma.courseModule, order: 3 },
    { kind: 'lesson', label: 'Сабақ', item: lesson, model: prisma.lesson, order: 4 },
  ]) {
    const editName = kind === 'module' ? 'Бөлімді өңдеу' : 'Сабақты өңдеу';
    const endpoint = `/${kind === 'module' ? 'modules' : 'lessons'}/${item.id}`;
    const form = page.getByRole('form', { name: `${label} параметрлері` });
    await page.getByRole('button', { name: `${editName}: ${item.title}`, exact: true }).click();
    await form.getByLabel(`${label} атауы`, { exact: true }).fill('Unsaved title');
    await form.getByLabel(`${label} реті`, { exact: true }).fill('99');
    await form.getByRole('button', { name: 'Болдырмау', exact: true }).click();
    assert.equal((await model.findUniqueOrThrow({ where: { id: item.id } })).title, item.title);
    assert.equal((await model.findUniqueOrThrow({ where: { id: item.id } })).order, item.order);
    await page.getByRole('button', { name: `${editName}: ${item.title}`, exact: true }).click();
    await form.getByLabel(`${label} атауы`, { exact: true }).fill('   ');
    await form.getByRole('button', { name: 'Сақтау', exact: true }).click();
    await form.getByRole('alert').getByText('Атауды енгізіңіз.').waitFor();
    const title = `${item.title} edited`;
    await form.getByLabel(`${label} атауы`, { exact: true }).fill(`  ${title}  `);
    await form.getByLabel(`${label} реті`, { exact: true }).fill(String(order));
    await page.route(`**${endpoint}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' }));
    await form.getByRole('button', { name: 'Сақтау', exact: true }).click();
    await form.getByRole('alert').getByText('Өзгерістер сақталмады. Енгізілген деректер сақталды, қайта көріңіз.').waitFor();
    assert.equal((await model.findUniqueOrThrow({ where: { id: item.id } })).title, item.title);
    assert.equal(await form.getByLabel(`${label} атауы`, { exact: true }).inputValue(), `  ${title}  `);
    await page.unroute(`**${endpoint}`);
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === endpoint && response.request().method() === 'PATCH');
    await form.getByRole('button', { name: 'Сақтау', exact: true }).click();
    assert.equal((await responsePromise).status(), 200);
    await form.waitFor({ state: 'hidden' });
    const saved = await model.findUniqueOrThrow({ where: { id: item.id } });
    assert.equal(saved.title, title); assert.equal(saved.order, order);
    if (kind === 'lesson') {
      assert.equal(saved.content, item.content);
      assert.equal(saved.moduleId, item.moduleId);
      assert.deepEqual(await prisma.step.findMany({ where: { lessonId: item.id }, orderBy: { id: 'asc' } }), stepsBefore);
    } else assert.equal(saved.courseId, item.courseId);
    const forbidden = await proctorContext.request.patch(`${api}${endpoint}`, { data: { title: 'Forbidden change' }, headers: { Origin: web, 'X-CSRF-Token': csrfToken } });
    assert.equal(forbidden.status(), 403);
    assert.equal((await model.findUniqueOrThrow({ where: { id: item.id } })).title, title);
    await page.reload();
    await page.getByRole('button', { name: `${editName}: ${title}`, exact: true }).click();
    assert.equal(await form.getByLabel(`${label} атауы`, { exact: true }).inputValue(), title);
    assert.equal(await form.getByLabel(`${label} реті`, { exact: true }).inputValue(), String(order));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await auditPage(page); assert.deepEqual(auditIssues, []);
    await form.getByRole('button', { name: 'Болдырмау', exact: true }).click();
    await page.setViewportSize({ width: 1365, height: 900 });
    updates[kind] = saved;
  }
  console.log('PASS teacher edits module/lesson titles and order without losing material; cancel, 503 retry, mobile UI and proctor denial');
  return updates;
}

async function verifyTeacherExams(page, proctorContext, courseId) {
  const listPath = `/courses/${courseId}/exams`;
  await page.route(`**${listPath}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' }));
  await page.reload();
  await page.getByRole('alert').getByText('Емтихандарды жүктеу мүмкін болмады.').waitFor();
  assert.equal(await page.getByText('Емтихан жоқ. Алғашқы емтиханды қосыңыз.').count(), 0);
  await page.unroute(`**${listPath}`);
  await page.getByRole('alert').getByRole('button', { name: 'Қайта жүктеу' }).click();
  await page.getByRole('alert').filter({ hasText: 'Емтихандарды жүктеу мүмкін болмады.' }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '+ Емтихан қосу' }).click();
  const title = `E2E authoring exam ${randomUUID()}`;
  await page.getByPlaceholder('Емтихан атауы (мысалы: Финалдық емтихан)').fill(title);
  await page.getByRole('button', { name: 'Емтихан қосу', exact: true }).click();
  await page.getByRole('button', { name: `Емтиханды өңдеу: ${title}` }).waitFor();
  const exam = await prisma.exam.findFirstOrThrow({ where: { courseId, title } });
  const settings = page.getByRole('form', { name: 'Емтихан параметрлері' });
  await page.getByRole('button', { name: `Емтиханды өңдеу: ${title}` }).click();
  await settings.getByLabel('Емтихан атауы').fill('Unsaved exam');
  await settings.getByRole('button', { name: 'Болдырмау' }).click();
  assert.equal((await prisma.exam.findUniqueOrThrow({ where: { id: exam.id } })).title, title);
  await page.getByRole('button', { name: `Емтиханды өңдеу: ${title}` }).click();
  await settings.getByLabel('Емтихан атауы').fill('   ');
  await settings.getByRole('button', { name: 'Сақтау' }).click();
  await settings.getByRole('alert').waitFor();
  const updatedTitle = `${title} edited`;
  await settings.getByLabel('Емтихан атауы').fill(`  ${updatedTitle}  `);
  await settings.getByLabel('Ұзақтығы (мин)').fill('35');
  await settings.getByLabel('Өту балы (%)').fill('75');
  const examPath = `/courses/${courseId}/exams/${exam.id}`;
  await page.route(`**${examPath}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' }));
  await settings.getByRole('button', { name: 'Сақтау' }).click();
  await settings.getByRole('alert').getByText('Емтихан сақталмады. Деректер сақталды, қайта көріңіз.').waitFor();
  assert.equal(await settings.getByLabel('Емтихан атауы').inputValue(), `  ${updatedTitle}  `);
  assert.equal((await prisma.exam.findUniqueOrThrow({ where: { id: exam.id } })).title, title);
  await page.unroute(`**${examPath}`);
  await settings.getByRole('button', { name: 'Сақтау' }).click();
  await page.getByRole('button', { name: `Емтиханды өңдеу: ${updatedTitle}` }).waitFor();
  const saved = await prisma.exam.findUniqueOrThrow({ where: { id: exam.id } });
  assert.equal(saved.duration, 35); assert.equal(saved.passScore, 75);

  await page.route(`**${examPath}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' }));
  await page.getByRole('button', { name: `Сұрақтарды көрсету: ${updatedTitle}` }).click();
  await page.getByRole('alert').getByText('Сұрақтарды жүктеу мүмкін болмады.').waitFor();
  assert.equal(await page.getByText('Сұрақтар жоқ', { exact: true }).count(), 0);
  await page.unroute(`**${examPath}`);
  await page.getByRole('alert').getByRole('button', { name: 'Қайта жүктеу' }).click();
  await page.getByRole('alert').filter({ hasText: 'Сұрақтарды жүктеу мүмкін болмады.' }).waitFor({ state: 'hidden' });
  const teacherCsrfResponse = await page.context().request.get(`${api}/auth/csrf`);
  const teacherCsrf = (await teacherCsrfResponse.json()).csrfToken;
  const rejectedQuestion = await page.context().request.post(`${api}${examPath}/questions`, {
    data: { text: 'Invalid answer key', type: 'SINGLE_CHOICE', options: ['A', 'B'], answer: 'C' },
    headers: { Origin: web, 'X-CSRF-Token': teacherCsrf },
  });
  assert.equal(rejectedQuestion.status(), 400);
  assert.equal(await prisma.question.count({ where: { examId: exam.id } }), 0);
  await page.getByRole('button', { name: '+ Сұрақ қосу' }).click();
  const editor = page.getByRole('form', { name: 'Сұрақ редакторы' });
  await editor.getByLabel('Сұрақ мәтіні').fill('   ');
  await editor.getByLabel('Жауап нұсқасы 1').fill('A');
  await editor.getByLabel('Жауап нұсқасы 2').fill('B');
  await editor.getByRole('button', { name: 'Сұрақты қосу' }).click();
  await editor.getByRole('alert').getByText('Сұрақ мәтінін енгізіңіз.').waitFor();
  const questionText = `E2E authored question ${randomUUID()}`;
  await editor.getByLabel('Сұрақ мәтіні').fill(questionText);
  await editor.getByRole('button', { name: 'Сұрақты қосу' }).click();
  await editor.getByRole('alert').getByText('Дұрыс жауапты белгілеңіз.').waitFor();
  await editor.getByRole('radio', { name: 'Дұрыс жауап: 1-нұсқа' }).check();
  await editor.getByRole('button', { name: 'Сұрақты қосу' }).click();
  await page.getByRole('button', { name: `Сұрақты өңдеу: ${questionText}` }).waitFor();
  const question = await prisma.question.findFirstOrThrow({ where: { examId: exam.id, text: questionText } });
  assert.deepEqual(question.options, ['A', 'B']); assert.equal(question.answer, 'A');

  await page.getByRole('button', { name: `Сұрақты өңдеу: ${questionText}` }).click();
  await editor.getByLabel('Сұрақ мәтіні').fill('Unsaved question');
  await editor.getByRole('button', { name: 'Болдырмау' }).click();
  assert.equal((await prisma.question.findUniqueOrThrow({ where: { id: question.id } })).text, questionText);
  await page.getByRole('button', { name: `Сұрақты өңдеу: ${questionText}` }).click();
  const editedQuestion = `${questionText} edited`;
  await editor.getByLabel('Сұрақ мәтіні').fill(editedQuestion);
  await editor.getByLabel('Сұрақ түрі').selectOption('MULTIPLE_CHOICE');
  await editor.getByLabel('Жауап нұсқасы 1').fill('A, B');
  await editor.getByLabel('Жауап нұсқасы 2').fill('C');
  await editor.getByRole('button', { name: '+ Нұсқа қосу' }).click();
  await editor.getByLabel('Жауап нұсқасы 3').fill('D');
  await editor.getByRole('checkbox', { name: 'Дұрыс жауап: 3-нұсқа' }).check();
  await editor.getByRole('button', { name: 'Нұсқаны жою: 2' }).click();
  const questionPath = `${examPath}/questions/${question.id}`;
  await page.route(`**${questionPath}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' }));
  await editor.getByRole('button', { name: 'Сұрақты жаңарту' }).click();
  await editor.getByRole('alert').getByText('Сұрақ сақталмады. Деректер сақталды, қайта көріңіз.').waitFor();
  assert.equal(await editor.getByLabel('Сұрақ мәтіні').inputValue(), editedQuestion);
  assert.equal((await prisma.question.findUniqueOrThrow({ where: { id: question.id } })).text, questionText);
  await page.unroute(`**${questionPath}`);
  await editor.getByRole('button', { name: 'Сұрақты жаңарту' }).click();
  await page.getByRole('button', { name: `Сұрақты өңдеу: ${editedQuestion}` }).waitFor();
  const edited = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
  assert.deepEqual(edited.options, ['A, B', 'D']);
  assert.deepEqual(JSON.parse(edited.answer), ['A, B', 'D']);

  const csrfResponse = await proctorContext.request.get(`${api}/auth/csrf`);
  const csrfToken = (await csrfResponse.json()).csrfToken;
  for (const endpoint of [examPath, questionPath]) {
    const denied = await proctorContext.request.patch(`${api}${endpoint}`, { data: { title: 'Forbidden', text: 'Forbidden' }, headers: { Origin: web, 'X-CSRF-Token': csrfToken } });
    assert.equal(denied.status(), 403);
  }
  await page.reload();
  await page.getByRole('button', { name: `Сұрақтарды көрсету: ${updatedTitle}` }).click();
  await page.getByRole('button', { name: `Сұрақты өңдеу: ${editedQuestion}` }).waitFor();
  await page.getByRole('button', { name: `Сұрақты өңдеу: ${editedQuestion}` }).click();
  assert.equal(await editor.getByLabel('Сұрақ түрі').inputValue(), 'MULTIPLE_CHOICE');
  assert.equal(await editor.getByRole('checkbox', { name: 'Дұрыс жауап: 1-нұсқа' }).isChecked(), true);
  assert.equal(await editor.getByRole('checkbox', { name: 'Дұрыс жауап: 2-нұсқа' }).isChecked(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await auditPage(page); assert.deepEqual(auditIssues, []);
  await page.setViewportSize({ width: 1365, height: 900 });
  console.log('PASS teacher edits exam and questions; answer keys, cancel, retry, reload, mobile and proctor denial');
}

async function main() {
  const ready = await fetch(`${api}/ready`);
  assert.equal(ready.status, 200);
  assert.equal((await fetch('http://localhost:9000/')).status, 403);
  const browser = await chromium.launch(browserOptions);
  const contexts = [];
  const sessions = new Map();
  try {
    // Fresh CI seeds intentionally remain private drafts. Supply only this suite's
    // own public fixture instead of depending on or publishing historical courses.
    const teacher = await login(browser, 'TEACHER');
    contexts.push(teacher.context);
    sessions.set('TEACHER', teacher);
    await createPublicCatalogFixture(teacher.context);
    const publicPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await publicPage.goto(web);
    await publicPage.locator('#courses').getByRole('heading', { name: 'Қолжетімді курстар', exact: true }).waitFor();
    assert.ok(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.equal(await publicPage.getByText('1 000+').count(), 0);
    let catalogUnavailable = true;
    const interceptCatalog = async route => {
      if (catalogUnavailable) await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' });
      else await route.continue();
    };
    await publicPage.route('**/courses?*', interceptCatalog);
    await publicPage.goto(`${web}/courses`);
    await publicPage.getByRole('heading', { name: /Жаңа дағды.*Жаңа мүмкіндік/ }).waitFor();
    await publicPage.getByRole('alert').getByText('Курстарды жүктеу мүмкін болмады.').waitFor();
    catalogUnavailable = false;
    await publicPage.getByRole('alert').getByRole('button', { name: 'Қайта жүктеу' }).click();
    const publicCards = publicPage.locator('a[href^="/courses/"]');
    await publicCards.first().waitFor();
    assert.ok(await publicCards.count() <= 12);
    await publicPage.getByRole('button', { name: 'Барлығы', exact: true }).click();
    assert.equal(await publicPage.getByText('Курстар жүктелуде...', { exact: true }).count(), 0, 'reselecting the current filter must not leave the catalog loading');
    assert.ok(await publicCards.count() > 0);
    assert.ok(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (await prisma.course.count({ where: { status: 'PUBLISHED' } }) > 12) {
      const firstHref = await publicCards.first().getAttribute('href');
      await publicPage.getByRole('button', { name: 'Келесі бет' }).click();
      await publicPage.waitForFunction(previous => document.querySelector('a[href^="/courses/"]')?.getAttribute('href') !== previous, firstHref);
      assert.notEqual(await publicCards.first().getAttribute('href'), firstHref);
    }
    await publicPage.unroute('**/courses?*', interceptCatalog);
    const courseHref = await publicCards.first().getAttribute('href');
    const publicCourse = await prisma.course.findUniqueOrThrow({ where: { id: decodeURIComponent(courseHref.split('/').at(-1)) } });
    await publicCards.first().click();
    await publicPage.getByRole('heading', { name: publicCourse.title, exact: true }).waitFor();
    await publicPage.getByRole('link', { name: 'Тіркеліп, курсты бастау' }).waitFor();
    await auditPage(publicPage);
    await publicPage.close();
    console.log('PASS public landing and paged catalog lead to a real course before registration');

    for (const [role, route, heading] of [
      ['STUDENT', '/dashboard/courses', 'Курстар'],
      ['TEACHER', '/dashboard/teacher/courses', 'Менің курстарым'],
      ['PROCTOR', '/dashboard/proctor', 'Проктор'],
      ['ADMIN', '/dashboard/admin/users', 'Пайдаланушылар'],
    ]) {
      let session = sessions.get(role);
      if (!session) {
        session = await login(browser, role);
        contexts.push(session.context);
        sessions.set(role, session);
      }
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
    await adminPage.getByRole('row').filter({ hasText: account('STUDENT').email }).getByRole('button', { name: '🎓 Рұқсат' }).waitFor();
    assert.equal(await adminPage.getByRole('row').filter({ hasText: account('ADMIN').email }).getByRole('combobox').isDisabled(), true);
    for (const role of ['teacher', 'proctor', 'admin']) {
      assert.equal(await adminPage.getByRole('row').filter({ hasText: account(role).email }).getByRole('button', { name: '🎓 Рұқсат' }).count(), 0);
    }
    const courseForGrant = await prisma.course.findFirstOrThrow();
    const csrfResponse = await sessions.get('ADMIN').context.request.get(`${api}/auth/csrf`);
    assert.equal(csrfResponse.status(), 200);
    const csrfToken = (await csrfResponse.json()).csrfToken;
    for (const role of ['TEACHER', 'PROCTOR', 'ADMIN']) {
      const staff = await prisma.user.findUniqueOrThrow({ where: { email: account(role).email } });
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
    const isCoursesRequest = value => {
      const url = new URL(value);
      return url.origin === api && url.pathname === '/courses';
    };
    await adminPage.route(isCoursesRequest, interceptCourses);
    await adminPage.goto(`${web}/dashboard/admin/users`);
    await adminPage.getByRole('row').filter({ hasText: account('STUDENT').email }).getByRole('button', { name: '🎓 Рұқсат' }).click();
    await adminPage.getByRole('alert').getByText('Курстарды жүктеу мүмкін болмады.').waitFor();
    coursesUnavailable = false;
    await adminPage.getByRole('alert').getByRole('button', { name: 'Қайта жүктеу' }).click();
    await adminPage.getByRole('alert').filter({ hasText: 'Курстарды жүктеу мүмкін болмады.' }).waitFor({ state: 'hidden' });
    assert.ok(await adminPage.getByLabel('Курс', { exact: true }).selectOption({ index: 1 }));
    await adminPage.getByRole('button', { name: 'Болдырмау' }).click();
    await adminPage.unroute(isCoursesRequest, interceptCourses);
    console.log('PASS admin grant course picker recovers from API outage');

    for (const role of ['TEACHER', 'ADMIN']) {
      const page = sessions.get(role).page;
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/courses/manage');
      await page.goto(`${web}/dashboard/teacher/courses`);
      const managed = await (await responsePromise).json();
      if (role === 'TEACHER') {
        const teacher = await prisma.user.findUniqueOrThrow({ where: { email: account('TEACHER').email } });
        assert.ok(managed.data.every(course => course.teacherId === teacher.id));
      }
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
      assert.equal(saved.status, 'DRAFT');
      assert.equal((await fetch(`${api}/courses/${saved.id}`)).status, 404);
      await teacherPage.getByRole('region', { name: 'Курс мәліметтері мен жариялау' }).getByRole('textbox', { name: /^Сипаттама/ }).fill('Edited browser authoring description with intended audience and learning outcome.');
      await teacherPage.getByRole('button', { name: 'Мәліметтерді сақтау', exact: true }).click();
      await teacherPage.getByText('Курс мәліметтері сақталды', { exact: true }).waitFor();
      assert.equal((await prisma.course.findUniqueOrThrow({ where: { id: saved.id } })).description, 'Edited browser authoring description with intended audience and learning outcome.');
      assert.equal(saved.teacherId, (await prisma.user.findUniqueOrThrow({ where: { email: account('TEACHER').email } })).id);
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
      const savedLesson = await prisma.lesson.findFirstOrThrow({ where: { title: lessonTitle } });
      assert.equal(savedLesson.moduleId, savedModule.id);
      await verifyTeacherSteps(teacherPage, savedLesson.id);
      const updatedOutline = await verifyOutlineSettings(teacherPage, sessions.get('PROCTOR').context, savedModule, savedLesson);
      await verifyTeacherExams(teacherPage, sessions.get('PROCTOR').context, saved.id);

      teacherPage.once('dialog', dialog => dialog.accept());
      await teacherPage.getByRole('button', { name: 'Курсты жариялау', exact: true }).click();
      await teacherPage.getByText('Курс жарияланды', { exact: true }).waitFor();
      assert.equal((await fetch(`${api}/courses/${saved.id}`)).status, 200);
      assert.equal((await prisma.course.findUniqueOrThrow({ where: { id: saved.id } })).status, 'PUBLISHED');

      teacherPage.once('dialog', dialog => dialog.accept());
      await teacherPage.getByRole('button', { name: `Сабақты жою: ${updatedOutline.lesson.title}` }).click();
      await teacherPage.getByRole('button', { name: `Сабақты жою: ${updatedOutline.lesson.title}` }).waitFor({ state: 'hidden' });
      assert.equal(await prisma.lesson.count({ where: { id: savedLesson.id } }), 0);

      teacherPage.once('dialog', dialog => dialog.accept());
      await teacherPage.getByText(`${updatedOutline.module.order}. ${updatedOutline.module.title}`).locator('..').getByRole('button', { name: 'Жою', exact: true }).click();
      await teacherPage.getByText(`${updatedOutline.module.order}. ${updatedOutline.module.title}`).waitFor({ state: 'hidden' });
      assert.equal(await prisma.courseModule.count({ where: { id: savedModule.id } }), 0);

      await teacherPage.goto(`${web}/dashboard/teacher/courses`);
      await teacherPage.getByText(courseTitle).first().waitFor();
      teacherPage.once('dialog', dialog => dialog.accept());
      await teacherPage.getByRole('button', { name: `Курсты мұрағаттау: ${courseTitle}` }).click();
      await teacherPage.getByText('Курс мұрағатталды', { exact: true }).waitFor();
      assert.equal((await prisma.course.findUniqueOrThrow({ where: { id: saved.id } })).status, 'ARCHIVED');
      assert.equal((await fetch(`${api}/courses/${saved.id}`)).status, 404);
      console.log('PASS teacher authors draft, deliberately publishes, archives preserving course; proctor cannot author');
    } finally {
      const created = await prisma.course.findFirst({ where: { title: courseTitle } });
      if (created) await prisma.course.delete({ where: { id: created.id } });
    }

    for (const [role, route, endpoint] of [
      ['TEACHER', '/dashboard/teacher/courses', '/courses/manage'],
      ['PROCTOR', '/dashboard/proctor', '/attempts'],
    ]) {
      const page = sessions.get(role).page;
      let fail = true;
      const matches = url => url.pathname === endpoint;
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
    assert.equal(await mobile.page.getByRole('dialog', { name: 'Жұмыс кеңістігінің мәзірі' }).isVisible(), true);
    await mobile.page.getByRole('dialog', { name: 'Жұмыс кеңістігінің мәзірі' }).getByRole('link', { name: 'Хабарландырулар' }).click();
    await mobile.page.waitForURL('**/dashboard/notifications');
    assert.ok(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await auditPage(mobile.page);
    await mobile.page.setViewportSize({ width: 768, height: 1024 });
    await mobile.page.goto(`${web}/dashboard/courses`);
    await mobile.page.getByRole('heading', { name: 'Курстар' }).waitFor();
    assert.ok(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await mobile.page.setViewportSize({ width: 390, height: 844 });
    console.log('PASS mobile navigation, width and WCAG A/AA automated checks');

    const keyboardCourse = await prisma.course.create({ data: {
      title: `E2E keyboard enrollment ${randomUUID()}`,
      description: 'Isolated keyboard enrollment check',
      lessons: { create: { title: 'Keyboard fixture lesson', content: 'Original keyboard test material', order: 1 } },
      level: 'BEGINNER',
      teacherId: (await prisma.user.findUniqueOrThrow({ where: { email: account('TEACHER').email } })).id,
    } });
    createdFixtureCourses.add(keyboardCourse.id);
    await publishCourse(sessions.get('TEACHER').context, keyboardCourse.id);
    await mobile.page.reload();
    await mobile.page.getByRole('heading', { name: 'Курстар' }).waitFor();
    const course = mobile.page.getByRole('button', { name: `${keyboardCourse.title}: Курсқа тіркелу`, exact: true });
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

    const fixture = await createExam(sessions.get('TEACHER').context);
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
    await verifyProctorFeed(sessions.get('PROCTOR'), studentPage, attempt);
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
    try {
      await archiveFixtureCourses(sessions.get('TEACHER')?.context);
    } finally {
      for (const context of contexts) await context.close().catch(() => {});
      await browser.close();
      await prisma.$disconnect();
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
