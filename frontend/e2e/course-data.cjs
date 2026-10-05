// Mocked local browser regressions for P2 #19 and student pagination in #20.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const web = process.env.E2E_WEB_URL || 'http://127.0.0.1:3107';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(web).hostname));
const datasets = ['courses', 'enrollments', 'certificates'];
const course = (index, level = 'BEGINNER') => ({ id: `course-${index}`, title: `Course ${index}`, level, teacher: { name: 'Teacher' }, _count: { lessons: 1, exams: 0 } });

async function setup(browser, failed) {
  const context = await browser.newContext();
  const state = { failed, requests: [], empty: false, held: null };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (data, status = 200) => route.fulfill({ json: data, status });
    if (path === '/auth/me') return json({ id: 'student', role: 'STUDENT', name: 'Student', email: 'student@example.test' });
    if (path === '/auth/csrf') return json({ csrfToken: 'test' });
    const dataset = path === '/courses' ? 'courses' : path === '/enrollments/my' ? 'enrollments' : path === '/certificates/my' ? 'certificates' : null;
    if (dataset) {
      state.requests.push(dataset);
      if (state.failed === dataset) return json({ message: 'Unavailable' }, 503);
      if (dataset === 'courses') {
        const page = Number(url.searchParams.get('page'));
        const limit = Number(url.searchParams.get('limit'));
        const level = url.searchParams.get('level');
        assert.equal(limit, 20);
        if (state.held && level === 'INTERMEDIATE') { state.held(route); return; }
        return json({ data: state.empty ? [] : Array.from({ length: page === 6 ? 1 : 20 }, (_, i) => course((page - 1) * 20 + i + 1, level)), page, limit, total: state.empty ? 0 : 101, totalPages: state.empty ? 0 : 6 });
      }
      if (dataset === 'enrollments') return json([{ id: 'enrollment', courseId: 'course-1', completedAt: null, course: course(1) }]);
      return json([]);
    }
    if (url.origin === new URL(web).origin) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(`${web}/dashboard/courses`);
  return { page, context, state };
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {}) });
  try {
    for (const dataset of datasets) {
      const { page, context, state } = await setup(browser, dataset);
      const error = page.getByRole('alert').filter({ hasText: `${dataset}:` });
      await error.waitFor();
      assert.equal(await page.getByText('Курс табылмады', { exact: true }).count(), 0);
      if (dataset !== 'courses') assert.ok(await page.getByRole('button', { name: 'Course 1: Күйі белгісіз', exact: true }).isDisabled());
      state.failed = null;
      const before = state.requests.length;
      await page.getByRole('button', { name: `Қайталау: ${dataset}`, exact: true }).click();
      await page.getByRole('button', { name: 'Course 1: Жалғастыру', exact: true }).waitFor();
      assert.ok(await page.getByRole('button', { name: 'Course 1: Жалғастыру', exact: true }).isEnabled());
      assert.deepEqual(state.requests.slice(before), [dataset], 'Retry only failed dataset');
      // A refresh failure retains confirmed data, but disables decisions based on stale state.
      state.failed = dataset;
      await page.getByRole('button', { name: 'Жаңарту', exact: true }).click();
      await error.waitFor();
      assert.ok((await error.textContent()).includes('ескірген'));
      assert.equal(await page.getByText('Course 1', { exact: true }).count(), 1);
      assert.ok(await page.getByRole('button', { name: 'Course 1: Күйі белгісіз', exact: true }).isDisabled());
      state.failed = null;
      await page.getByRole('button', { name: `Қайталау: ${dataset}`, exact: true }).click();
      await page.getByRole('button', { name: 'Course 1: Жалғастыру', exact: true }).waitFor();
      await context.close();
      console.log(`PASS ${dataset}: initial failure, targeted retry, stale refresh, recovery`);
    }
    const { page, context, state } = await setup(browser, null);
    await page.getByRole('button', { name: 'Course 1: Жалғастыру', exact: true }).waitFor();
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: 'Келесі', exact: true }).click();
      await page.getByRole('button', { name: `Course ${(i + 1) * 20 + 1}: Курсқа тіркелу`, exact: true }).waitFor();
    }
    assert.ok(await page.getByRole('button', { name: 'Course 101: Курсқа тіркелу', exact: true }).isEnabled());
    await page.getByRole('button', { name: 'Course 101: Курсқа тіркелу', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Болдырмау', exact: true }).click();
    // An old filter response must not overwrite the latest filter/page.
    let heldRoute;
    state.held = route => { heldRoute = route; };
    await page.getByRole('button', { name: /Орта деңгей/ }).click();
    await page.waitForFunction(() => document.querySelector('[role="status"]') !== null);
    while (!heldRoute) await new Promise(resolve => setTimeout(resolve, 10));
    await page.getByRole('button', { name: /Жоғары деңгей/ }).click();
    await page.getByRole('button', { name: 'Course 1: Жалғастыру', exact: true }).waitFor();
    await heldRoute.fulfill({ json: { data: [course(999, 'INTERMEDIATE')], page: 1, limit: 20, total: 1, totalPages: 1 } });
    await page.waitForTimeout(200);
    assert.equal(await page.getByText('Course 999', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Course 1', { exact: true }).count(), 1);
    state.empty = true;
    await page.getByRole('button', { name: 'Жаңарту', exact: true }).click();
    await page.getByText('Курс табылмады', { exact: true }).waitFor();
    assert.equal(await page.getByRole('alert').filter({ hasText: 'Деректерді жүктеу қатесі' }).count(), 0);
    await context.close();
    console.log('PASS 101st course reachable/actionable, filter reset, stale response ignored, successful empty distinct');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
