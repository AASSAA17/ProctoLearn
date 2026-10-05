// Mocked API regression; run against a local Next server (default port 3107).
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const web = process.env.E2E_WEB_URL || 'http://localhost:3107';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(web).hostname));
const course = { id: 'errors', title: 'Error regression', modules: [{ id: 'm', title: 'Module', order: 1, lessons: [1, 2].map(n => ({ id: `lesson-${n}`, title: `Lesson ${n}`, order: n, steps: [{ id: `step-${n}`, type: 'TEXT', order: 1, content: { text: 'Read' } }] })) }] };
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {}) });
  try {
    for (const failure of ['material', 'course', 'lesson', 'empty', 'loading', 'refresh-course', 'refresh-lesson']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      let recovered = failure.startsWith('refresh-');
      let releaseProgress;
      const progressGate = new Promise(resolve => { releaseProgress = resolve; });
      const counts = {};
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        const path = url.pathname;
        const json = (body, status = 200) => route.fulfill({ status, json: body });
        if (path === '/auth/me') return json({ id: 'student', role: 'STUDENT', name: 'Student', email: 'student@example.test' });
        if (path === '/auth/csrf') return json({ csrfToken: 'csrf' });
        if (path === '/courses/errors/material') {
          counts.material = (counts.material || 0) + 1;
          if (failure === 'material' && !recovered) return json({ message: 'Unavailable' }, 503);
          return json(failure === 'empty' ? { ...course, modules: [] } : course);
        }
        if (path.startsWith('/submissions/')) {
          if (failure === 'loading') await progressGate;
          counts[path] = (counts[path] || 0) + 1;
          if (!recovered && ((failure.endsWith('course') && path.includes('/course/')) || (failure.endsWith('lesson') && path.includes('lesson-2')))) return json({ message: 'Unavailable' }, 503);
          return json(path.includes('/course/') ? { completedLessons: 1 } : [{ id: path.includes('lesson-1') ? 'step-1' : 'step-2', completed: true }]);
        }
        if (url.origin === new URL(web).origin) return route.continue();
        return route.abort();
      });
      try {
        await page.goto(`${web}/dashboard/courses/errors/learn`);
        if (failure.startsWith('refresh-')) {
          await page.getByText('2 / 2 қадам').waitFor();
          recovered = false;
          await page.getByRole('button', { name: 'Прогресті жаңарту', exact: true }).click();
          await page.getByText('Соңғы расталған прогресс көрсетілген;', { exact: false }).waitFor();
          await page.getByText('2 / 2 қадам').waitFor();
          await page.getByRole('button', { name: 'Келесі қадам →' }).waitFor();
          const successful = counts['/submissions/lesson/lesson-1/progress'];
          const materials = counts.material;
          recovered = true;
          await page.getByRole('button', { name: 'Прогресті қайта жүктеу' }).click();
          await page.getByText('Прогрестің бір бөлігі жүктелмеді.', { exact: false }).waitFor({ state: 'hidden' });
          await page.getByRole('status').filter({ hasText: 'Прогресс жүктелуде...' }).waitFor({ state: 'hidden' });
          await page.getByText('2 / 2 қадам').waitFor();
          assert.equal(counts['/submissions/lesson/lesson-1/progress'], successful);
          assert.equal(counts.material, materials);
        } else if (failure === 'loading') {
          await page.getByRole('status').filter({ hasText: 'Прогресс жүктелуде...' }).waitFor();
          assert.equal(await page.getByText(/\d+ \/ 2 қадам/).count(), 0);
          releaseProgress();
          await page.getByText('2 / 2 қадам').waitFor();
        } else if (failure === 'empty') {
          await page.getByText('Курста қадамдар жоқ').waitFor();
          assert.equal(await page.getByText('Прогрестің бір бөлігі жүктелмеді.', { exact: false }).count(), 0);
          assert.equal(await page.getByText('Курс жүктеу қатесі').count(), 0);
        } else if (failure === 'material') {
          await page.getByText('Курс жүктеу қатесі').waitFor();
          assert.ok(page.url().endsWith('/learn'), 'material failure must not redirect to an apparent empty course');
          recovered = true;
          await page.getByRole('button', { name: 'Қайта жүктеу', exact: true }).click();
          await page.getByText('2 / 2 қадам').waitFor();
        } else {
          await page.getByText('Прогрестің бір бөлігі жүктелмеді.', { exact: false }).waitFor();
          await page.getByRole('button', { name: 'Келесі қадам →' }).waitFor();
          assert.equal(await page.getByText(/\d+ \/ 2 қадам/).count(), 0, 'unknown progress is not a zero or partial aggregate');
          const successful = counts['/submissions/lesson/lesson-1/progress'];
          const materials = counts.material;
          await page.getByRole('button', { name: 'Прогресті қайта жүктеу' }).click();
          await page.getByText('Прогрестің бір бөлігі жүктелмеді.', { exact: false }).waitFor();
          await page.getByRole('button', { name: 'Келесі қадам →' }).waitFor();
          assert.equal(counts['/submissions/lesson/lesson-1/progress'], successful, 'retry preserves confirmed lesson and requests only failures');
          recovered = true;
          await page.getByRole('button', { name: 'Прогресті қайта жүктеу' }).click();
          await page.getByText('2 / 2 қадам').waitFor();
          assert.equal(counts.material, materials);
        }
        console.log(`PASS learning ${failure}: explicit failure/empty, retained progress and targeted recovery`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
