const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');
const frontendRequire = createRequire(path.join(__dirname, '../frontend/package.json'));

test('original demo clip decodes and plays in Chromium with its documented dimensions', async () => {
  const bytes = fs.readFileSync(path.join(__dirname, '../frontend/public/demo/html-structure.webm'));
  const server = http.createServer((request, response) => {
    if (request.url === '/clip.webm') { response.writeHead(200, { 'Content-Type': 'video/webm', 'Content-Length': bytes.length }); response.end(bytes); }
    else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><video id="clip" muted controls src="/clip.webm"></video>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { chromium } = frontendRequire('playwright');
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {}) });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('video').evaluate(video => video.play());
    await page.waitForFunction(() => document.querySelector('video').currentTime > 0.5);
    const state = await page.locator('video').evaluate(video => ({ width: video.videoWidth, height: video.videoHeight, error: video.error?.code ?? null, paused: video.paused }));
    assert.deepEqual(state, { width: 960, height: 540, error: null, paused: false });
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
