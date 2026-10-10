'use strict';
// Operates only the two explicitly prepared fictional QR records; evidence stays private.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const { client, json, validateFixture } = require('../../scripts/qr-demo-certificate.cjs');
const { tunnelOrigin, distinctFixtures } = require('../../scripts/qr-phone-demo.cjs');
const directory = path.resolve(__dirname, '../../.local/qr-phone-demo');
(async () => {
  const session = JSON.parse(fs.readFileSync(path.join(directory, 'session.json')));
  assert.equal(session.kind, 'proctolearn-qr-phone-v1'); assert.equal(session.ready, true);
  const origin = tunnelOrigin(session.origin);
  const primary = validateFixture(JSON.parse(fs.readFileSync(path.join(directory, 'certificate.json'))), 'phone');
  const revoked = validateFixture(JSON.parse(fs.readFileSync(path.join(directory, 'revocation-certificate.json'))), 'revocation');
  distinctFixtures([primary, revoked]);
  assert.deepEqual(session.certificateCodes, [primary.code, revoked.code]);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const evidence = path.join(directory, 'evidence'); fs.mkdirSync(evidence, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); const requests = []; const errors = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`); });
  const url = code => `${origin}/verify/${code}`;
  const state = text => page.getByText(text, { exact: true }).waitFor({ timeout: 30000 });
  try {
    await page.goto(url(primary.code)); await state('Сертификаттың берілгені расталды');
    await state(primary.snapshot.recipientName); await state(primary.snapshot.courseTitle);
    assert.equal(await page.locator('time').getAttribute('datetime'), primary.snapshot.issuedAt);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(await page.locator('a[href]').evaluateAll(links => links.map(link => link.getAttribute('href'))), ['#public-content']);
    await page.screenshot({ path: path.join(evidence, 'public-valid.png'), fullPage: true });
    const data = await context.request.get(`${origin}/api/public/certificates/verify/${primary.code}`);
    assert.equal(data.status(), 200); assert.match(data.headers()['cache-control'], /no-store/);
    assert.equal((await data.json()).valid, true);
    await page.goto(url(revoked.code));
    const initial = await (await context.request.get(`${origin}/api/public/certificates/verify/${revoked.code}`)).json();
    if (initial.valid) {
      await state('Сертификаттың берілгені расталды');
      const accounts = JSON.parse(fs.readFileSync(path.resolve(directory, '../release-demo/accounts.json')));
      const admin = accounts.find(account => account.id === 'demo-release-admin'); const local = client();
      await json(await local.call('/auth/login', 'POST', { email: admin.email, password: admin.password }));
      try { await json(await local.call(`/admin/certificates/${revoked.certificateId}/revoke`, 'POST', { reason: 'Fictional phone QR revocation acceptance' })); }
      finally { await local.call('/auth/logout', 'POST', {}); }
      await page.reload();
    }
    await state('Сертификаттың күші жойылған');
    await page.screenshot({ path: path.join(evidence, 'public-revoked.png'), fullPage: true });
    await page.goto(url(randomUUID())); await state('Сертификат табылмады');
    await page.screenshot({ path: path.join(evidence, 'public-unknown.png'), fullPage: true });
    assert.deepEqual(errors, []);
    assert.ok(requests.every(request => {
      const parsed = new URL(request);
      return parsed.origin === origin && !parsed.search && (
        /^\/verify\/[0-9a-f-]{36}$/.test(parsed.pathname)
        || /^\/api\/public\/certificates\/verify\/[0-9a-f-]{36}$/.test(parsed.pathname)
        || session.assets.includes(parsed.pathname) || parsed.pathname === '/favicon.ico');
    }), 'Browser requests must remain inside the exact public allowlist');
    const actualRequests = [...new Set(requests)];
    // Explicit fault fixture: checks hydrated unavailable/retry UI, not a claimed live outage.
    await page.route('**/api/public/certificates/verify/**', route => route.fulfill({ status: 503, json: { error: 'Verification unavailable' } }));
    await page.goto(url(primary.code)); await page.getByRole('button', { name: 'Қайта тексеру' }).waitFor();
    await page.screenshot({ path: path.join(evidence, 'public-unavailable-fixture.png'), fullPage: true });
    await page.unrouteAll(); await page.getByRole('button', { name: 'Қайта тексеру' }).click(); await state('Сертификаттың берілгені расталды');
    fs.writeFileSync(path.join(evidence, 'public-browser.json'), JSON.stringify({ status: 'PASS', at: new Date().toISOString(), origin, viewport: '390x844', requests: actualRequests, actualConsoleErrors: [], checks: ['valid snapshot', 'local authorized dedicated revocation', 'same URL revoked after reload', 'unknown', '503 unavailable fixture and retry', 'same-origin HTTPS only', 'no horizontal overflow', 'no dead navigation'], physicalPhone: 'AWAITING_OPERATOR' }, null, 2));
    console.log('PASS public HTTPS browser: live valid/revoked/unknown with no console errors, mixed content or private requests; separately unavailable503 fixture and retry. Physical phone AWAITING_OPERATOR.');
  } finally { await browser.close(); }
})().catch(error => { console.error(`${error.name}: ${error.message}`); process.exitCode = 1; });
