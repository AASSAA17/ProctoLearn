// Prepare explicitly fictional demonstration states using authenticated domain APIs.
// The canvas is synthetic evidence, never a claim of a physical camera/device test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const directory = path.join(root, '.local/release-demo');
const profile = path.join(directory, '.env.local');
if (process.env.E2E_DISPOSABLE !== 'true' || path.resolve(process.env.E2E_ENV_FILE || '') !== profile ||
  fs.lstatSync(directory).isSymbolicLink() || JSON.parse(fs.readFileSync(path.join(directory, 'ownership.json'))).kind !== 'proctolearn-isolated-release-v1') throw new Error('Explicit owned release profile required');
const env = parseEnv(fs.readFileSync(profile, 'utf8'));
const web = 'http://localhost:3000';
const api = 'http://localhost:4000';
if (env.NODE_ENV !== 'development' || env.POSTGRES_DB !== 'proctolearn_release' || env.FRONTEND_URL !== web || env.NEXT_PUBLIC_API_URL !== api) throw new Error('Dedicated localhost release stack required');
const accounts = JSON.parse(fs.readFileSync(path.join(directory, 'accounts.json'), 'utf8'));
const courseId = 'demo-release-web-foundations-v1';
const examId = 'demo-release-web-exam-v1';
const report = { date: new Date().toISOString(), courseId, syntheticEvidence: true, operations: [], status: 'IN_PROGRESS' };
const artifacts = path.join(directory, 'evidence');
fs.mkdirSync(artifacts, { recursive: true });

async function login(browser, handle) {
  const account = accounts.find(item => item.id === `demo-release-${handle}`);
  assert.ok(account, 'Expected marked account');
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${web}/auth/login`);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Пароль', { exact: true }).fill(account.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/dashboard');
  const csrf = await context.request.get(`${api}/auth/csrf`);
  assert.equal(csrf.status(), 200);
  return { context, page, csrf: (await csrf.json()).csrfToken };
}

async function request(session, route, method = 'GET', data) {
  const response = await session.context.request.fetch(api + route, {
    method, ...(data !== undefined ? { data } : {}),
    headers: { Origin: web, 'X-CSRF-Token': session.csrf },
  });
  if (!response.ok()) throw new Error(`${method} ${route}: HTTP ${response.status()}`);
  return response.json();
}

function answerFor(content) {
  if (['single_choice', 'multiple_choice'].includes(content.taskType)) return { selected: content.correctAnswer };
  if (content.taskType === 'text_input') return { text: content.correctAnswer };
  if (content.taskType === 'number_input') return { value: content.correctAnswer };
  throw new Error('Unsupported demo task');
}

async function completeLessons(session, lessons, limit) {
  await request(session, `/enrollments/courses/${courseId}`, 'POST');
  const progress = await request(session, `/courses/${courseId}/lessons/progress/my`);
  for (const lesson of lessons.slice(0, limit)) {
    if (progress.some(entry => entry.id === lesson.id && entry.completed)) continue;
    const completed = await request(session, `/submissions/lesson/${lesson.id}/progress`);
    for (const step of lesson.steps) {
      if (completed.some(entry => entry.id === step.id && entry.completed)) continue;
      if (step.type === 'TASK') {
        const result = await request(session, `/steps/${step.id}/submit`, 'POST', { answer: answerFor(step.content) });
        assert.equal(result.isCorrect, true);
        assert.equal(result.correctAnswer, null);
      } else await request(session, `/steps/${step.id}/complete`, 'POST');
    }
    if (lesson.assignmentAnswer) await request(session, `/courses/${courseId}/lessons/${lesson.id}/check-assignment`, 'POST', { answer: lesson.assignmentAnswer });
    else await request(session, `/courses/${courseId}/lessons/${lesson.id}/complete`, 'POST');
  }
  return request(session, `/courses/${courseId}/lessons/progress/my`);
}

const syntheticCapture = () => {
  const stream = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    const graphics = canvas.getContext('2d');
    let frame = 0;
    const timer = setInterval(() => {
      graphics.fillStyle = '#172033'; graphics.fillRect(0, 0, 640, 480);
      graphics.fillStyle = '#ffffff'; graphics.font = '24px sans-serif';
      graphics.fillText('DEMO — SYNTHETIC RECORDING', 35, 100);
      graphics.fillText(`Automated fictional scenario / frame ${frame++}`, 35, 150);
    }, 100);
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
    return canvas.captureStream(12);
  };
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => stream() });
  Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => stream() });
};

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {}) });
  const contexts = [];
  try {
    const teacher = await login(browser, 'teacher'); contexts.push(teacher.context);
    const material = await request(teacher, `/courses/${courseId}/material`);
    assert.equal(material.status, 'PUBLISHED');
    const lessons = material.modules.flatMap(module => module.lessons);
    assert.equal(lessons.length, 5, 'Preparation must not silently adopt changed curriculum');

    const progressStudent = await login(browser, 'student-progress'); contexts.push(progressStudent.context);
    const partial = await completeLessons(progressStudent, lessons, lessons.length - 1);
    report.progressCompleted = partial.filter(entry => entry.completed).length;
    assert.equal(report.progressCompleted, 4, 'Existing owner-completed progress is preserved; use another fixture rather than reset it');
    const denied = await progressStudent.context.request.post(`${api}/attempts/start/${examId}`, { headers: { Origin: web, 'X-CSRF-Token': progressStudent.csrf } });
    assert.equal(denied.status(), 403);
    assert.equal((await denied.json()).code, 'COURSE_INCOMPLETE');
    await progressStudent.page.goto(`${web}/dashboard/courses/${courseId}`);
    await progressStudent.page.getByRole('heading', { name: material.title, exact: true }).waitFor();
    await progressStudent.page.screenshot({ path: path.join(artifacts, 'original-course-progress.png'), fullPage: true });
    report.operations.push('student-progress completed first four lessons through API; unfinished lesson blocks exam');

    const resultStudent = await login(browser, 'student-result'); contexts.push(resultStudent.context);
    const completed = await completeLessons(resultStudent, lessons, lessons.length);
    assert.equal(completed.filter(entry => entry.completed).length, 5);
    report.operations.push('student-result completed all five lessons and deterministic task through API');
    const proctor = await login(browser, 'proctor'); contexts.push(proctor.context);
    let certificates = await request(resultStudent, '/certificates/my');
    let certificate = certificates.find(item => item.courseId === courseId);
    if (certificate && certificate.status !== 'VALID') throw new Error('Existing revoked certificate preserved; no automatic reissue');
    if (!certificate) {
      let attempts = await request(resultStudent, '/attempts/my');
      let attempt = attempts.find(item => item.examId === examId && item.finishedAt && item.status === 'FINISHED');
      if (!attempt) {
        const exam = await request(teacher, `/courses/${courseId}/exams/${examId}`);
        const page = await resultStudent.context.newPage();
        await page.addInitScript(syntheticCapture);
        await page.goto(`${web}/dashboard/exam/${examId}`);
        await page.getByRole('button', { name: /Камера мен экранды қосып/ }).click();
        await page.getByRole('heading', { name: exam.questions[0].text, exact: true }).waitFor();
        for (let index = 0; index < exam.questions.length; index++) {
          const question = exam.questions[index];
          await page.getByRole('heading', { name: question.text, exact: true }).waitFor();
          if (question.type === 'SINGLE_CHOICE') await page.getByRole('radio', { name: question.answer, exact: true }).check();
          else if (question.type === 'MULTIPLE_CHOICE') {
            const answers = question.answer.startsWith('[') ? JSON.parse(question.answer) : question.answer.split(',');
            for (const answer of answers) await page.getByRole('checkbox', { name: answer, exact: true }).check();
          } else await page.getByRole('textbox', { name: 'Жауап', exact: true }).fill(question.answer);
          if (index < exam.questions.length - 1) await page.getByRole('button', { name: 'Келесі →', exact: true }).click();
        }
        await page.getByText('Жауаптар серверде сақталды', { exact: true }).waitFor();
        await page.waitForTimeout(2500); // Accumulate actual encoded MediaRecorder frames.
        await page.getByRole('button', { name: 'Жауаптарды жіберу', exact: true }).click();
        await page.getByRole('heading', { name: 'Жауаптар қабылданды', exact: true }).waitFor({ timeout: 60000 });
        attempts = await request(resultStudent, '/attempts/my');
        attempt = attempts.find(item => item.examId === examId && item.finishedAt && item.status === 'FINISHED');
        assert.ok(attempt, 'Demo assessment must really pass');
        report.operations.push('original exam answered and submitted in browser with synthetic camera/screen MediaRecorder streams');
        await page.screenshot({ path: path.join(artifacts, 'original-exam-submitted.png'), fullPage: true });
      }
      report.attemptId = attempt.id;
      const deadline = Date.now() + 60000;
      let evidence;
      do {
        evidence = await request(proctor, `/evidence/${attempt.id}`);
        if (['recording_camera', 'recording_screen'].every(kind => evidence.some(file => file.type === kind && file.state === 'AVAILABLE'))) break;
        await proctor.page.waitForTimeout(1000);
      } while (Date.now() < deadline);
      for (const kind of ['recording_camera', 'recording_screen']) {
        const entry = evidence.find(file => file.type === kind && file.state === 'AVAILABLE');
        assert.ok(entry?.url, `Available ${kind} evidence required`);
        const media = await proctor.context.request.get(entry.url);
        assert.equal(media.status(), 200);
        assert.equal((await media.body()).subarray(0, 4).toString('hex'), '1a45dfa3');
      }
      await proctor.page.goto(`${web}/dashboard/proctor/evidence/${attempt.id}`);
      await proctor.page.getByText('Камера', { exact: true }).first().waitFor();
      await proctor.page.screenshot({ path: path.join(artifacts, 'original-synthetic-evidence.png'), fullPage: true });
      await request(proctor, `/proctor/sessions/${attempt.id}/review`, 'POST', { decision: 'APPROVED', reason: 'Prepared fictional demonstration: synthetic camera and screen recordings, automatic scenario; not a physical identity verification.' });
      report.operations.push('assigned proctor verified private playback bytes and approved with explicit synthetic-demonstration reason');
      certificates = await request(resultStudent, '/certificates/my');
      certificate = certificates.find(item => item.courseId === courseId && item.status === 'VALID');
      assert.ok(certificate, 'Certificate must be issued by actual review policy');
    }
    if (!report.attemptId) {
      const attempts = await request(resultStudent, '/attempts/my');
      const approved = attempts.find(item => item.examId === examId && item.finishedAt && item.status === 'FINISHED' && item.reviewStatus === 'APPROVED');
      assert.ok(approved, 'Existing original certificate requires the preserved approved demo attempt');
      report.attemptId = approved.id;
      report.operations.push('reused preserved approved original demo attempt and valid certificate');
    }
    report.certificateId = certificate.id;
    const pdf = await resultStudent.context.request.get(`${api}/certificates/${certificate.id}/pdf`);
    assert.equal(pdf.status(), 200);
    assert.equal((await pdf.body()).subarray(0, 4).toString(), '%PDF');
    const verification = await fetch(`${api}/certificates/verify/${encodeURIComponent(certificate.qrCode)}`);
    assert.equal(verification.status, 200);
    const publicPage = await browser.newPage();
    await publicPage.goto(`${web}/verify/${encodeURIComponent(certificate.qrCode)}`);
    await publicPage.getByText('Сертификаттың берілгені расталды', { exact: true }).waitFor();
    await publicPage.screenshot({ path: path.join(artifacts, 'original-certificate-verified.png'), fullPage: true });
    report.operations.push('student PDF bytes and anonymous QR route verified');
    report.status = 'PASS';
    console.log('PASS original demo: progress4/5, result5/5, deterministic task, browser exam, private synthetic recordings, assigned review, certificate PDF and anonymous verification');
  } catch (error) {
    report.status = 'FAIL';
    report.failureType = error.name;
    throw error;
  } finally {
    fs.writeFileSync(path.join(artifacts, `original-scenarios-${report.date.replace(/[:.]/g, '-')}.json`), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    fs.writeFileSync(path.join(artifacts, 'original-scenarios.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    for (const context of contexts) await context.close().catch(() => {});
    await browser.close();
  }
}
main().catch(error => { console.error(`Original demonstration scenario failed (${error.name}); inspect private screenshots and the scenario status report. Credentials and answer-bearing selectors are omitted.`); process.exitCode = 1; });
