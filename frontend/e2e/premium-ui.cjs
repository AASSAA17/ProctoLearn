// Presentation regression suite. API fixtures here are tests, never product data.
// UI_BASE_URL=http://localhost:3000 UI_ARTIFACT_DIR=<path> node e2e/premium-ui.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.UI_BASE_URL || 'http://localhost:3000';
const output = process.env.UI_ARTIFACT_DIR;
const widths = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
const course = {
  id: 'ui-fixture', title: 'Тест: Қазақстандағы бағдарламалау негіздері',
  description: 'Тек автоматтандырылған интерфейс тексеруіне арналған тест дерегі.',
  level: 'BEGINNER', teacher: { name: 'Тест авторы' }, _count: { lessons: 4, enrollments: 0 },
};

(async () => {
  if (output) fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {}) });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  const report = { fixtureBased: true, responsive: [], accessibility: [], checks: [] };
  let responseMode = 'success';
  await context.route('**/courses?**', (route) => {
    if (route.request().resourceType() === 'document') return route.continue();
    return route.fulfill({ status: responseMode === 'error' ? 503 : 200, contentType: 'application/json', body: JSON.stringify({ data: responseMode === 'success' ? [course] : [], total: responseMode === 'success' ? 1 : 0, totalPages: 1 }) });
  });
  try {
    await page.goto(base);
    await page.getByRole('link', { name: /Тест: Қазақстандағы/ }).waitFor();
    await page.getByRole('button', { name: 'Жоғары деңгей', exact: true }).click();
    await page.getByText('Бұл деңгейде әзірге курс жоқ.').waitFor();
    await page.getByRole('button', { name: 'Барлығы', exact: true }).click();
    assert.equal(await page.locator('canvas').count(), 0, 'Reduced motion must use static hero');
    report.checks.push('Real course rendering path, level filters, empty state, reduced-motion fallback');
    responseMode = 'error';
    await page.reload();
    await page.getByRole('button', { name: 'Қайта жүктеу', exact: true }).waitFor();
    responseMode = 'success';
    await page.getByRole('button', { name: 'Қайта жүктеу', exact: true }).click();
    await page.getByRole('link', { name: /Тест: Қазақстандағы/ }).waitFor();
    report.checks.push('503 error and successful retry');

    for (const route of ['/', '/courses', '/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password?token=presentation-test-only']) {
      await page.goto(`${base}${route}`);
      await page.locator('h1').first().waitFor();
      if (route === '/courses') await page.getByRole('link', { name: /Тест: Қазақстандағы/ }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert.equal(overflow, false, `${route} overflows at ${width}px`);
        report.responsive.push({ route, width, overflow });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      const failures = await page.evaluate(async () => (await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      })).violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })));
      report.accessibility.push({ route, failures });
      if (output && ['/', '/auth/login', '/courses'].includes(route)) {
        const name = route === '/' ? 'home' : route.replaceAll('/', '-').slice(1);
        await page.screenshot({ path: path.join(output, `${name}-mobile.png`), fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.screenshot({ path: path.join(output, `${name}-desktop.png`), fullPage: true });
      }
    }
    await page.goto(base);
    await page.setViewportSize({ width: 390, height: 844 });
    const menu = page.getByRole('button', { name: 'Мәзірді ашу', exact: true });
    await menu.click();
    await page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.equal(await menu.evaluate((el) => document.activeElement === el), true);
    report.checks.push('Mobile menu Escape and focus restoration');
    const violations = report.accessibility.flatMap((item) => item.failures.map((failure) => ({ route: item.route, ...failure })));
    if (output) fs.writeFileSync(path.join(output, 'ui-regression.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ responsiveChecks: report.responsive.length, checks: report.checks, violations }, null, 2));
    assert.equal(violations.length, 0, 'Accessibility violations must be resolved');
  } finally {
    if (output) fs.writeFileSync(path.join(output, 'ui-regression.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
