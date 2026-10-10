// Real release pages; CSS zoom is a lab reflow check, not a native-browser zoom certification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const directory = path.join(root, '.local/release-demo');
const profile = path.join(directory, '.env.local');
if (process.env.E2E_DISPOSABLE !== 'true' || path.resolve(process.env.E2E_ENV_FILE || '') !== profile ||
  fs.lstatSync(directory).isSymbolicLink() || JSON.parse(fs.readFileSync(path.join(directory, 'ownership.json'))).kind !== 'proctolearn-isolated-release-v1') throw new Error('Owned release profile required');
const accounts = JSON.parse(fs.readFileSync(path.join(directory, 'accounts.json'), 'utf8'));
const output = path.join(directory, 'evidence/role-ui');
fs.mkdirSync(output, { recursive: true });
const widths = [320, 360, 390, 768, 1024, 1440];
const report = { date: new Date().toISOString(), fixtureBased: false, zoomMethod: 'document.documentElement.style.zoom = 2; native-browser zoom requires manual verification', responsive: [], accessibility: [], keyboard: [], problems: [], status: 'IN_PROGRESS' };

async function inspect(page, route, label) {
  await page.goto(`http://localhost:3000${route}`);
  await page.locator('h1').first().waitFor();
  if (label === 'student') await page.getByText('4 / 5 сабақ аяқталды', { exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    report.responsive.push({ label, route, width, zoom: 1, overflow });
    if ([320, 1440].includes(width)) await page.screenshot({ path: path.join(output, `${label}-${width}.png`), fullPage: true });
    if (width === 320 && label === 'completed-course') {
      const bannerTitle = page.getByText('Барлық сабақтарды аяқтадыңыз!', { exact: true });
      const bounds = await bannerTitle.boundingBox();
      if (!bounds || bounds.width < 100) report.problems.push('completed-course: exam banner text squeezed on narrow viewport');
    }
    if (overflow) report.problems.push(`${label}: horizontal overflow at ${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  report.responsive.push({ label, route, width: 1440, zoom: 2, overflow });
  await page.screenshot({ path: path.join(output, `${label}-css-zoom-200.png`), fullPage: true });
  if (overflow) report.problems.push(`${label}: horizontal overflow at CSS zoom 200%`);
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const failures = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.map(node => node.target) })));
  report.accessibility.push({ label, route, failures });
  if (failures.length) report.problems.push(`${label}: ${JSON.stringify(failures)}`);
  await page.keyboard.press('Tab');
  const focusVisible = await page.evaluate(() => {
    const target = document.activeElement;
    if (!target || target === document.body) return false;
    const box = target.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight;
  });
  report.keyboard.push({ label, focusableElement: focusVisible });
  if (!focusVisible) report.problems.push(`${label}: first Tab must focus a visible control`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {}) });
  try {
    const publicContext = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await publicContext.newPage();
    for (const [route, label] of [['/', 'home'], ['/courses', 'catalog'], ['/auth/login', 'login']]) await inspect(page, route, label);
    await publicContext.close();
    for (const [handle, routes] of [
      ['student-progress', [['/dashboard', 'student'], ['/dashboard/courses/demo-release-web-foundations-v1', 'student-course']]],
      ['student-result', [['/dashboard/courses/demo-release-web-foundations-v1', 'completed-course']]],
      ['teacher', [['/dashboard/teacher/courses', 'teacher'], ['/dashboard/teacher/courses/demo-release-web-foundations-v1/edit', 'teacher-editor']]],
      ['proctor', [['/dashboard/proctor', 'proctor']]],
      ['admin', [['/dashboard/admin/users', 'admin']]],
    ]) {
      const account = accounts.find(item => item.id === `demo-release-${handle}`);
      const context = await browser.newContext({ reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.goto('http://localhost:3000/auth/login');
      await page.getByLabel('Email', { exact: true }).fill(account.email);
      await page.getByLabel('Пароль', { exact: true }).fill(account.password);
      await page.locator('button[type=submit]').click();
      await page.waitForURL('**/dashboard');
      for (const [route, label] of routes) await inspect(page, route, label);
      await context.close();
    }
    assert.equal(report.problems.length, 0, JSON.stringify(report.problems));
    report.status = 'PASS';
    console.log(JSON.stringify({ status: report.status, responsiveChecks: report.responsive.length, accessibilityPages: report.accessibility.length, keyboardChecks: report.keyboard.length, zoomMethod: report.zoomMethod }));
  } catch (error) {
    report.status = 'FAIL';
    report.failureType = error.name;
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, `report-${report.date.replace(/[:.]/g, '-')}.json`), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
