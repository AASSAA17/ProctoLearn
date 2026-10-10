'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { chromium } = require('playwright');
(async () => {
  const directory = path.resolve(__dirname, '../../.local/pilot-author');
  const lessons = JSON.parse(fs.readFileSync(path.join(directory, 'courses/C04.json'))).modules.flatMap(m => m.lessons);
  const report = { at: new Date().toISOString(), checks: [], scope: 'Reviewed original examples, local fixture HTTP server, actual Chrome; no participant code' };
  const expected = [['900'], ['false', 'true 13'], ['0 Қате'], ['600'], ['[20,40]'], ['false true']];
  for (let i = 0; i < 6; i++) {
    const lines = [];
    vm.runInNewContext(lessons[i].example.code, { console: { log: (...values) => lines.push(values.map(value => Array.isArray(value) ? JSON.stringify(value) : String(value)).join(' ')) } }, { timeout: 1000 });
    assert.deepEqual(lines, expected[i]); report.checks.push({ lesson: lessons[i].authoringId, result: 'PASS', environment: process.version + ' isolated VM, no IO bindings' });
  }
  let status = 200; let delay = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/api/items') { const current = status; setTimeout(() => { if (!response.destroyed) { response.writeHead(current, { 'content-type': 'application/json' }); response.end(JSON.stringify({ items: [1, 2] })); } }, delay); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end('<!doctype html><html lang="kk"><title>Local author example fixture</title><body></body></html>');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  try {
    for (let i = 6; i < 12; i++) {
      await page.goto(origin);
      const code = lessons[i].example.code;
      if (i === 6 || i === 7) await page.setContent(code);
      if (i === 6) { assert.equal(await page.locator('#result').innerText(), '<b>Оқу</b>'); assert.equal(await page.locator('#result b').count(), 0); }
      if (i === 7) { await page.locator('button').click(); await page.locator('button').click(); assert.equal(await page.locator('button').innerText(), '2'); }
      if (i === 8) {
        await page.setContent('<div id="list"><button data-id="42"><span>Таңдау</span></button><p>Бос орын</p></div>');
        await page.addScriptTag({ content: 'window.list=document.querySelector("#list");window.events=[];console.log=value=>events.push(value);' + code });
        await page.locator('span').click(); await page.locator('p').click(); assert.deepEqual(await page.evaluate(() => window.events), ['42']);
      }
      if (i === 9) {
        await page.setContent('<form><label>Атау<input></label><button>Сақтау</button></form><p id="message"></p>');
        await page.addScriptTag({ content: 'window.form=document.querySelector("form");window.input=document.querySelector("input");window.message=document.querySelector("#message");' + code });
        await page.locator('input').fill('  '); await page.locator('button').click(); assert.equal(await page.locator('#message').innerText(), 'Атау қажет');
        await page.locator('input').fill('Оқу'); await page.locator('button').click(); assert.equal(await page.locator('#message').innerText(), 'Сақтауға дайын');
      }
      if (i === 10) {
        await page.addScriptTag({ content: code });
        status = 200; assert.deepEqual(await page.evaluate(() => load()), { items: [1, 2] });
        status = 404; assert.deepEqual(await page.evaluate(() => load()), { error: 'Дерек қолжетімсіз' }); status = 200;
      }
      if (i === 11) {
        delay = 500;
        const message = page.waitForEvent('console', { predicate: value => value.text() === 'AbortError', timeout: 3000 });
        await page.addScriptTag({ content: code }); await message;
      }
      report.checks.push({ lesson: lessons[i].authoringId, result: 'PASS', environment: 'Actual Chrome, explicit DOM dependency fixtures and real loopback HTTP success/error/abort' });
    }
    report.result = 'PASS'; fs.writeFileSync(path.join(directory, 'evidence/c04-browser-examples.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ result: 'PASS', examples: report.checks.length }));
  } finally { await browser.close(); await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
