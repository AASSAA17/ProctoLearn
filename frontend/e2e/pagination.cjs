// Run against a local Next server; every API response is mocked.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const web = process.env.E2E_WEB_URL || 'http://127.0.0.1:3107';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(web).hostname));
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage();
    const calls = [];
    let heldSearch;
    let role = 'ADMIN';
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(web).origin && !url.pathname.startsWith('/api/')) return route.continue();
      const path = url.pathname.replace(/^\/api/, '');
      const n = Number(url.searchParams.get('page') || 1);
      const send = data => route.fulfill({ json: data });
      calls.push({ path, page: n, search: url.searchParams.get('search'), limit: url.searchParams.get('limit'), teacherId: url.searchParams.get('teacherId') });
      if (path === '/auth/csrf') return send({ csrfToken: 'test-csrf' });
      if (path === '/auth/me') return send({ id: 'admin', name: 'Admin', role, email: 'admin@test.local' });
      if (path === '/admin/users') {
        const search = url.searchParams.get('search');
        if (search === 'slow') { heldSearch = route; return; }
        const index = n === 2 ? 51 : 1;
        return send({ data: [{ id: `user-${index}`, name: `${search || 'User'} ${index}`, email: 'student@test.local', role: 'STUDENT', _count: { attempts: 0, certificates: 0 } }], meta: { total: 51, totalPages: 2, page: n, limit: 50 } });
      }
      if (path === '/courses') {
        const limit = Number(url.searchParams.get('limit'));
        const index = n === 2 ? limit + 1 : 1;
        return send({ data: [{ id: `course-${index}`, title: `Course ${index}`, level: 'BEGINNER', teacher: { name: 'Teacher' } }], page: n, totalPages: 2, total: limit + 1, limit });
      }
      if (path.endsWith('/progress')) return send({ user: { id: 'user-51', name: 'User 51', email: 'student@test.local' }, courses: [] });
      return send([]);
    });
    await page.goto(`${web}/dashboard/admin/users`);
    await page.getByText('User 1', { exact: true }).waitFor();
    await page.getByRole('navigation', { name: 'Пайдаланушы беттері' }).getByText('Келесі').click();
    await page.getByText('User 51', { exact: true }).waitFor();
    await page.getByRole('button', { name: '🎓 Рұқсат' }).click();
    await page.getByRole('navigation', { name: 'Курс беттері' }).getByText('Келесі').click();
    await page.locator('#grant-course option[value="course-21"]').waitFor({ state: 'attached' });
    await page.locator('#grant-course').selectOption('course-21');
    await page.getByRole('button', { name: 'Растау', exact: true }).click();
    await page.locator('#grant-course').waitFor({ state: 'detached' });
    await page.getByText('User 51', { exact: true }).waitFor();
    assert.ok(calls.some(c => c.path.endsWith('/user-51/grant-exam-access/course-21')));
    await page.getByRole('textbox', { name: 'Пайдаланушыны іздеу' }).fill('filtered');
    await page.getByRole('button', { name: 'Іздеу', exact: true }).click();
    await page.getByText('filtered 1', { exact: true }).waitFor();
    await page.getByRole('navigation', { name: 'Пайдаланушы беттері' }).getByText('Келесі').click();
    await page.getByText('filtered 51', { exact: true }).waitFor();
    assert.ok(calls.some(c => c.path === '/admin/users' && c.page === 2 && c.search === 'filtered' && c.limit === '50'));
    await page.getByRole('textbox', { name: 'Пайдаланушыны іздеу' }).fill('slow');
    await page.getByRole('button', { name: 'Іздеу', exact: true }).click();
    while (!heldSearch) await page.waitForTimeout(10);
    await page.getByRole('textbox', { name: 'Пайдаланушыны іздеу' }).fill('new');
    await page.getByRole('button', { name: 'Іздеу', exact: true }).click();
    await page.getByText('new 1', { exact: true }).waitFor();
    await heldSearch.fulfill({ json: { data: [], meta: { totalPages: 0 } } });
    await page.waitForTimeout(100);
    assert.equal(await page.getByText('new 1', { exact: true }).count(), 1);
    await page.goto(`${web}/dashboard/admin/users/user-51`);
    await page.getByRole('button', { name: '🎓 Жаңа курсқа рұқсат беру' }).click();
    await page.getByRole('navigation', { name: 'Курс беттері' }).getByText('Келесі').click();
    await page.getByRole('combobox', { name: 'Курс', exact: true }).selectOption('course-21');
    await page.getByRole('button', { name: 'Растау', exact: true }).click();
    await page.getByRole('combobox', { name: 'Курс', exact: true }).waitFor({ state: 'detached' });
    assert.equal(calls.filter(c => c.path.endsWith('/user-51/grant-exam-access/course-21')).length, 2);
    await page.goto(`${web}/dashboard/teacher/courses`);
    await page.getByRole('heading', { name: 'Course 1', exact: true }).waitFor();
    await page.getByRole('navigation', { name: 'Курс беттері' }).getByText('Келесі').click();
    await page.getByRole('heading', { name: 'Course 101', exact: true }).waitFor();
    assert.ok(await page.locator('a[href="/dashboard/teacher/courses/course-101/edit"]').count());
    role = 'TEACHER';
    await page.reload();
    await page.getByRole('heading', { name: 'Менің курстарым', exact: true }).waitFor();
    await page.getByRole('navigation', { name: 'Курс беттері' }).getByText('Келесі').click();
    await page.getByRole('heading', { name: 'Course 101', exact: true }).waitFor();
    assert.ok(calls.some(c => c.path === '/courses' && c.page === 2 && c.teacherId === 'admin' && c.limit === '100'));
    assert.ok(calls.filter(c => c.path === '/courses').every(c => ['20', '100'].includes(c.limit)));
    console.log('PASS pagination: users 51, grant course 21 (both selectors), staff course 101, search reset/persistence and stale response protection');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
