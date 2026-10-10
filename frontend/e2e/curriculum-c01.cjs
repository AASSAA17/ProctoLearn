'use strict';
// Offline instructional examples. No pilot participants, backend, or external requests.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const directory = path.resolve(__dirname, '../../.local/pilot-author');
  const bundle = JSON.parse(fs.readFileSync(path.join(directory, 'courses/C01.json')));
  const lessons = bundle.modules.flatMap(module => module.lessons);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', route => route.abort());
  const page = await context.newPage(); const results = [];
  const output = path.join(directory, 'evidence'); fs.mkdirSync(output, { recursive: true });
  try {
    for (const lesson of lessons) {
      const code = lesson.example.code; const number = Number(lesson.authoringId.slice(-2));
      if (number === 12) { results.push({ id: lesson.authoringId, state: 'OPERATOR_PROTOCOL_PENDING', scope: 'Native zoom and assistive technology are not executable source code' }); continue; }
      let html = code;
      if (number >= 8 && number <= 10) html = `<style>${code}</style><main><a href="#test">Клуб</a><div class="cards"><div class="card">Бір</div><div class="card">Екі</div><div class="card">Үш</div></div></main>`;
      if (number === 11) html += '<div class="layout"><main>Мазмұн</main><aside>Кесте</aside></div>';
      await page.setViewportSize({ width: 390, height: 844 }); await page.setContent(html);
      if (number === 1) { assert.equal(await page.title(), 'Оқу клубы'); assert.equal(await page.locator('h1').innerText(), 'Сәлем, оқырман!'); assert.equal(await page.locator('html').getAttribute('lang'), 'kk'); }
      if (number === 2) { assert.equal(await page.locator('p strong').innerText(), 'сенбі'); assert.equal(await page.locator('a').getAttribute('href'), 'schedule.html'); }
      if (number === 3) assert.deepEqual(await page.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href'))), ['pages/about.html', '../index.html']);
      if (number === 4) { assert.equal(await page.locator('h1').count(), 1); assert.equal(await page.locator('ol li').count(), 2); assert.equal(await page.locator('ol').evaluate(element => getComputedStyle(element).listStyleType), 'decimal'); }
      if (number === 5) { assert.equal(await page.getByRole('navigation', { name: 'Негізгі' }).count(), 1); assert.equal(await page.getByRole('main').count(), 1); }
      if (number === 6) { const input = page.getByLabel('Email', { exact: true }); assert.equal(await input.count(), 1); await input.fill('invalid'); assert.equal(await input.evaluate(element => element.validity.typeMismatch), true); await input.fill('fictional@example.invalid'); assert.equal(await input.evaluate(element => element.validity.valid), true); }
      if (number === 7) assert.equal(await page.locator('.notice').evaluate(element => getComputedStyle(element).color), 'rgb(0, 100, 0)');
      if (number === 8) { assert.equal(await page.locator('.card').first().evaluate(element => element.getBoundingClientRect().width), 100); await page.locator('.card').first().evaluate(element => element.style.boxSizing = 'content-box'); assert.equal(await page.locator('.card').first().evaluate(element => element.getBoundingClientRect().width), 124); }
      if (number === 9) { await page.keyboard.press('Tab'); assert.equal(await page.locator('a').evaluate(element => document.activeElement === element), true); assert.equal(await page.locator('a').evaluate(element => getComputedStyle(element).outlineWidth), '3px'); }
      if (number === 10) { const narrow = await page.locator('.card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().y)); assert.ok(narrow[1] > narrow[0]); await page.setViewportSize({ width: 1280, height: 844 }); const wide = await page.locator('.card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().y)); assert.ok(wide.every(y => y === wide[0])); }
      if (number === 11) { assert.equal(await page.locator('.layout').evaluate(element => getComputedStyle(element).display), 'block'); await page.setViewportSize({ width: 1024, height: 844 }); assert.equal(await page.locator('.layout').evaluate(element => getComputedStyle(element).display), 'grid'); }
      results.push({ id: lesson.authoringId, state: 'VERIFIED', scope: number === 3 ? 'Both actual relative href values; navigation between physical files not claimed' : 'Actual Chrome DOM/computed styles/interaction with explicit educational fixture wrappers where needed' });
      await page.screenshot({ path: path.join(output, `${lesson.authoringId}.png`) });
    }
    fs.writeFileSync(path.join(output, 'c01-browser-examples.json'), JSON.stringify({ at: new Date().toISOString(), browser: browser.version(), status: 'PASS', results, nativeZoom: 'AWAITING_OPERATOR', physicalPhone: 'AWAITING_OPERATOR' }, null, 2), { mode: 0o600 });
    console.log(`PASS C01 browser examples: ${results.filter(result => result.state === 'VERIFIED').length} verified; final operator protocol remains pending. No external requests.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(`C01 example check failed: ${error.message}`); process.exitCode = 1; });
