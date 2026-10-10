// Opt-in browser acceptance for the running, owned release in DEMO_AI_PROVIDER=off mode.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID, randomBytes } = require('node:crypto');
const { chromium, request } = require('playwright');
const root = path.resolve(__dirname, '../..');
const profile = path.join(root, '.local/release-demo');
const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.E2E_DISPOSABLE, 'true');
assert.equal(process.env.DEMO_AI_PROVIDER, 'off');
assert.equal(path.resolve(process.env.E2E_ENV_FILE || ''), path.join(profile, '.env.local'));
assert.equal(fs.lstatSync(profile).isSymbolicLink(), false);
assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'ownership.json'))).kind, 'proctolearn-isolated-release-v1');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
assert.equal(url.port, '5433');
assert.equal(url.pathname, '/proctolearn_release');
const { PrismaClient } = createRequire(path.join(root, 'backend/package.json'))('@prisma/client');
const db = new PrismaClient();
const email = `ai-off-${randomUUID()}@example.invalid`;
const name = 'AI disabled acceptance fixture';
const password = `Demo!!39${randomBytes(24).toString('hex')}`;
const web = 'http://localhost:3000';
const expected = 'Жергілікті AI қосылмаған. / Локальный AI не включён. Курсы, экзамены и сертификаты доступны независимо от чата.';

(async () => {
  let browser, client;
  try {
    client = await request.newContext({ baseURL: 'http://localhost:4000' });
    const core = async () => {
      assert.equal((await client.get('/ready')).status(), 200);
      assert.equal((await client.get('/courses?limit=3')).status(), 200);
    };
    await core();
    const csrf = await (await client.get('/auth/csrf')).json();
    const registration = await client.post('/auth/register', {
      data: { name, email, password }, headers: { Origin: web, 'X-CSRF-Token': csrf.csrfToken },
    });
    assert.equal(registration.status(), 201);
    browser = await chromium.launch({ headless: true, ...(process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {}) });
    const page = await browser.newPage();
    await page.goto(`${web}/auth/login`);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Пароль', { exact: true }).fill(password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/dashboard');
    await page.getByRole('button', { name: 'AI Ассистент', exact: true }).click();
    const response = page.waitForResponse(r => r.url().endsWith('/ai/chat') && r.request().method() === 'POST');
    const started = Date.now();
    await page.locator('#learning-assistant textarea').fill('Что такое HTML?');
    await page.getByRole('button', { name: 'Жіберу', exact: true }).click();
    const [chat] = await Promise.all([response, core()]);
    assert.equal(chat.status(), 201);
    assert.equal((await chat.json()).reply, expected);
    await page.getByText(expected, { exact: true }).waitFor();
    const elapsedMs = Date.now() - started;
    await page.getByRole('button', { name: 'AI Ассистент', exact: true }).click();
    await page.goto(`${web}/courses`);
    await page.locator('h1').first().waitFor();
    await core();
    const result = { date: new Date().toISOString(), status: 'PASS', disabledReplyVisible: true, elapsedMs, ready: 200, catalog: 200, fixture: 'unique fictional user removed after check' };
    fs.writeFileSync(path.join(profile, 'ai-disabled-result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally {
    try { if (browser) await browser.close(); }
    finally {
      try { if (client) await client.dispose(); }
      finally {
        try {
          await db.user.deleteMany({ where: { email, name, role: 'STUDENT' } });
          assert.equal(await db.user.count({ where: { email } }), 0);
        } finally { await db.$disconnect(); }
      }
    }
  }
})().catch(error => { console.error(`AI-disabled acceptance failed: ${error.name}`); process.exitCode = 1; });
