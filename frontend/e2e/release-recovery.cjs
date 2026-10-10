'use strict';
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { chromium, request } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
if (process.env.E2E_DISPOSABLE !== 'true' || !process.env.E2E_ENV_FILE?.includes('release-demo')) throw new Error('Use the isolated release wrapper');
const api = 'http://localhost:4000', web = 'http://localhost:3000';
const artifact = path.resolve(__dirname, '../../.local/release-demo/recovery-result.json');
const email = `recovery-${randomUUID()}@example.invalid`;
const password = `Recovery!!99${randomBytes(16).toString('hex')}`;
const replacement = `Reset!!99${randomBytes(16).toString('hex')}`;
const mutation = async (client, route, data) => {
  const csrf = await (await client.get('/auth/csrf')).json();
  return client.post(route, { data, headers: { Origin: web, 'X-CSRF-Token': csrf.csrfToken } });
};
(async () => {
  const client = await request.newContext({ baseURL: api });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const registered = await mutation(client, '/auth/register', { name: 'Recovery acceptance fixture', email, password });
    assert.equal(registered.status(), 201);
    assert.doesNotMatch(await registered.text(), /accessToken|refreshToken|password/);
    const context = await browser.newContext(); const page = await context.newPage();
    await page.goto(`${web}/auth/forgot-password`);
    await page.locator('input[type=email]').fill(email);
    const sent = page.waitForResponse(r => r.url().endsWith('/auth/forgot-password') && r.request().method() === 'POST');
    await page.locator('button[type=submit], form button').last().click();
    assert.equal((await sent).status(), 201);
    let token;
    for (let count = 0; count < 30 && !token; count++) {
      const messages = await (await fetch('http://127.0.0.1:8025/api/messages')).json();
      const mail = messages.find(m => m.recipient.includes(email));
      if (mail) {
        const raw = mail.raw.replace(/=\r\n/g, '').replace(/=([a-f0-9]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        token = raw.match(/token=([a-f0-9]{64})/)?.[1];
      }
      if (!token) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(token, 'local SMTP captured a usable reset link');
    await page.goto(`${web}/auth/reset-password?token=${token}`);
    await page.locator('#new-password').fill(replacement);
    await page.locator('#confirm-password').fill(replacement);
    const reset = page.waitForResponse(r => r.url().endsWith('/auth/reset-password') && r.request().method() === 'POST');
    await page.locator('form button').last().click();
    assert.equal((await reset).status(), 201);
    await page.getByRole('status').filter({ hasText: 'Құпиясөз жаңартылды' }).waitFor();
    assert.ok(!page.url().includes('token='), 'reset URL scrubbed');
    assert.equal((await client.get('/auth/me')).status(), 401, 'old session invalidated');
    assert.equal((await mutation(client, '/auth/reset-password', { token, newPassword: password })).status(), 400, 'one-use token');
    assert.equal((await mutation(client, '/auth/login', { email, password })).status(), 401, 'old password rejected');
    assert.equal((await mutation(client, '/auth/login', { email, password: replacement })).status(), 201);
    assert.equal((await mutation(client, '/auth/change-password', { currentPassword: replacement, newPassword: password })).status(), 201);
    assert.equal((await client.get('/auth/me')).status(), 401);
    assert.equal((await mutation(client, '/auth/login', { email, password })).status(), 201);
    assert.equal((await mutation(client, '/auth/logout', {})).status(), 201);
    assert.equal((await client.get('/auth/me')).status(), 401);
    fs.writeFileSync(artifact, JSON.stringify({ at: new Date().toISOString(), status: 'PASS', checks: ['registration', 'browser forgot-password', 'real local SMTP delivery', 'browser reset-password', 'token reuse denied', 'old session revoked', 'old password denied', 'change-password revokes session', 'logout'], credentials: 'not included' }, null, 2));
    console.log('PASS live recovery: registration, SMTP, browser reset, single use, session revocation, change and logout');
  } finally { await client.dispose(); await browser.close(); }
})().catch(error => { console.error(`Recovery acceptance failed: ${error.name}: ${error.message.replace(/[a-f0-9]{64}/g, '[redacted]')}`); process.exitCode = 1; });
