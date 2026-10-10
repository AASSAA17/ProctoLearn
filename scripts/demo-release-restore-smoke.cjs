'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const frontendRequire = createRequire(path.join(__dirname, '../frontend/package.json'));
const directory = path.resolve(__dirname, '../.local/release-demo');
const state = JSON.parse(fs.readFileSync(path.join(directory, 'running.json')));
if (!state.ready || !state.restored || state.mode !== 'application' || !/^release_restore_[a-f0-9]{12}$/.test(state.database)) throw new Error('Start an owned verified restored target before the smoke test.');
const accounts = JSON.parse(fs.readFileSync(path.join(directory, 'accounts.json')));
const scenario = JSON.parse(fs.readFileSync(path.join(directory, 'evidence/original-scenarios.json')));
if (scenario.status !== 'PASS') throw new Error('A verified original demo scenario is required before restoring it.');
const web = 'http://localhost:3000', api = 'http://localhost:4000';
const report = { status: 'IN_PROGRESS', date: new Date().toISOString(), targetDatabase: state.database, checks: [] };
async function main() {
  const { chromium } = frontendRequire('playwright');
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {}) });
  async function login(handle) {
    const account = accounts.find(account => account.id === `demo-release-${handle}`);
    assert.ok(account);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(web + '/auth/login');
    await page.getByLabel('Email', { exact: true }).fill(account.email);
    await page.getByLabel('Пароль', { exact: true }).fill(account.password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/dashboard');
    return { context, page };
  }
  try {
    const learner = await login('student-result');
    const materialResponse = await learner.context.request.get(`${api}/courses/${scenario.courseId}/material`);
    assert.equal(materialResponse.status(), 200);
    const material = await materialResponse.json();
    assert.equal(material.modules.length, 2);
    const lessons = material.modules.flatMap(module => module.lessons);
    assert.equal(lessons.length, 5);
    await learner.page.goto(`${web}/dashboard/courses/${scenario.courseId}/learn`);
    await learner.page.getByText(lessons[0].title, { exact: true }).first().waitFor();
    const progress = await learner.context.request.get(`${api}/courses/${scenario.courseId}/lessons/progress/my`);
    assert.equal(progress.status(), 200);
    assert.equal((await progress.json()).filter(lesson => lesson.completed).length, 5);
    report.checks.push('browser login, original curriculum and completed learning progress survive restore');
    const attempts = await learner.context.request.get(`${api}/attempts/my`);
    assert.equal(attempts.status(), 200);
    const completed = (await attempts.json()).find(attempt => scenario.attemptId
      ? attempt.id === scenario.attemptId
      : attempt.examId === 'demo-release-web-exam-v1' && attempt.reviewStatus === 'APPROVED');
    assert.equal(completed?.reviewStatus, 'APPROVED');
    report.attemptId = completed.id;
    const certificates = await learner.context.request.get(`${api}/certificates/my`);
    assert.equal(certificates.status(), 200);
    const certificate = (await certificates.json()).find(certificate => certificate.id === scenario.certificateId);
    assert.equal(certificate?.status, 'VALID');
    const pdf = await learner.context.request.get(`${api}/certificates/${certificate.id}/pdf`);
    assert.equal(pdf.status(), 200);
    assert.equal((await pdf.body()).subarray(0, 4).toString(), '%PDF');
    const publicPage = await browser.newPage();
    await publicPage.goto(`${web}/verify/${encodeURIComponent(certificate.qrCode)}`);
    await publicPage.getByText('Сертификаттың берілгені расталды', { exact: true }).waitFor();
    report.checks.push('approved result, certificate PDF and anonymous QR verification remain usable');
    const proctor = await login('proctor');
    const evidenceResponse = await proctor.context.request.get(`${api}/evidence/${completed.id}`);
    assert.equal(evidenceResponse.status(), 200);
    const evidence = await evidenceResponse.json();
    for (const kind of ['recording_camera', 'recording_screen']) {
      const file = evidence.find(file => file.type === kind && file.state === 'AVAILABLE');
      assert.ok(file?.url);
      assert.ok(new URL(file.url).pathname.includes(state.bucket), 'playback must point to the restored bucket');
      const media = await proctor.context.request.get(file.url);
      assert.equal(media.status(), 200);
      assert.equal((await media.body()).subarray(0, 4).toString('hex'), '1a45dfa3');
      const unsigned = new URL(file.url); unsigned.search = '';
      const denied = await fetch(unsigned, { signal: AbortSignal.timeout(5000) });
      await denied.body?.cancel();
      assert.equal(denied.status, 403);
      const playback = await proctor.context.newPage();
      await playback.setContent('<video muted controls></video>');
      await playback.locator('video').evaluate((video, url) => { video.src = url; return video.play(); }, file.url);
      await playback.waitForFunction(() => document.querySelector('video').currentTime > 0.25);
      assert.equal(await playback.locator('video').evaluate(video => video.error?.code ?? null), null);
      await playback.close();
    }
    await proctor.page.goto(`${web}/dashboard/proctor/evidence/${completed.id}`);
    await proctor.page.getByText('Камера', { exact: true }).first().waitFor();
    await proctor.page.screenshot({ path: path.join(directory, 'evidence/restored-evidence.png'), fullPage: true });
    report.checks.push('assigned proctor sees both restored synthetic recordings; actual playback advances and unsigned access is403');
    report.status = 'PASS';
    console.log('PASS restored application: browser login, course/progress, approved result, PDF/public QR, both private playable recording streams.');
  } catch (error) { report.status = 'FAIL'; report.failure = error.name; report.details = error.message; throw error; }
  finally {
    fs.writeFileSync(path.join(directory, 'evidence/restored-smoke.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    await browser.close();
  }
}
main().catch(error => { console.error(`Restored application smoke failed (${error.name}); inspect private evidence. No source profile data was changed.`); process.exitCode = 1; });
