'use strict';
// Fictional acceptance identities only; all credentials and PDFs stay in ignored local state.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { tunnelOrigin } = require('./qr-phone-demo.cjs');
const ROOT = path.resolve(__dirname, '..');
const DIRECTORY = path.join(ROOT, '.local/qr-phone-demo');
const API = 'http://127.0.0.1:4000';
const WEB = 'http://localhost:3000';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pdfName = slot => slot === 'phone' ? 'phone-certificate.pdf' : 'revocation-certificate.pdf';
function validateFixture(value, slot) {
  if (!value || value.kind !== 'proctolearn-qr-fictional-certificate-v1'
    || !UUID.test(value.userId) || !UUID.test(value.certificateId) || !UUID.test(value.code)
    || !/^qr-phone-[0-9a-f-]{36}@example\.invalid$/.test(value.email)
    || typeof value.password !== 'string' || value.password.length < 24 || value.password.length > 100
    || value.pdf !== pdfName(slot) || !value.snapshot || value.snapshot.issuedVia !== 'ADMIN_OVERRIDE'
    || typeof value.snapshot.issuedAt !== 'string' || !Number.isFinite(Date.parse(value.snapshot.issuedAt))
    || typeof value.snapshot.recipientName !== 'string' || value.snapshot.recipientName.length > 500
    || typeof value.snapshot.courseTitle !== 'string' || value.snapshot.courseTitle.length > 500) throw new Error('QR certificate fixture schema differs; nothing overwritten.');
  return value;
}
function client() {
  const cookies = new Map();
  async function call(route, method = 'GET', data) {
    let csrf;
    if (method !== 'GET') csrf = (await (await call('/auth/csrf')).json()).csrfToken;
    const response = await fetch(API + route, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Origin: WEB, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(data ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    for (const line of response.headers.getSetCookie()) { const pair = line.split(';')[0]; const split = pair.indexOf('='); cookies.set(pair.slice(0, split), pair.slice(split + 1)); }
    return response;
  }
  return { call };
}
async function json(response, status = 201) {
  if (response.status !== status) throw new Error(`Fictional QR fixture operation failed: HTTP ${response.status}`);
  return response.json();
}
async function prepareCertificate(slot = 'phone') {
  if (!['phone', 'revocation'].includes(slot)) throw new Error('Unknown fictional certificate slot.');
  const FILE = path.join(DIRECTORY, slot === 'phone' ? 'certificate.json' : 'revocation-certificate.json');
  if (fs.existsSync(FILE)) {
    if (fs.lstatSync(FILE).isSymbolicLink()) throw new Error('QR fixture cannot be a symbolic link.');
    const value = JSON.parse(fs.readFileSync(FILE));
    return validateFixture(value, slot);
  }
  const student = client();
  const password = `QrDemo!!29${randomBytes(24).toString('hex')}`;
  const email = `qr-phone-${randomUUID()}@example.invalid`;
  const registered = await json(await student.call('/auth/register', 'POST', { name: slot === 'phone' ? 'Демонстрациялық QR студенті' : 'QR кері қайтару сынағы', email, password }));
  const accounts = JSON.parse(fs.readFileSync(path.join(ROOT, '.local/release-demo/accounts.json')));
  const account = accounts.find(item => item.id === 'demo-release-admin');
  const admin = client();
  await json(await admin.call('/auth/login', 'POST', { email: account.email, password: account.password }));
  const result = await json(await admin.call(`/admin/users/${registered.user.id}/grant-certificate/demo-release-web-foundations-v1`, 'POST', {}));
  const certificate = result.certificate;
  if (certificate.status !== 'VALID' || certificate.issuedVia !== 'ADMIN_OVERRIDE') throw new Error('Dedicated fictional QR certificate was not granted as labelled admin exception.');
  const value = { kind: 'proctolearn-qr-fictional-certificate-v1', userId: registered.user.id, email, password,
    certificateId: certificate.id, code: certificate.qrCode, recipient: certificate.recipientName,
    snapshot: { issuedAt: certificate.issuedAt, recipientName: certificate.recipientName, courseTitle: certificate.courseTitle, issuedVia: certificate.issuedVia },
    pdf: pdfName(slot) };
  validateFixture(value, slot);
  fs.writeFileSync(FILE, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
  await admin.call('/auth/logout', 'POST', {}); await student.call('/auth/logout', 'POST', {});
  return value;
}
async function refreshPDF(origin, slot = 'phone') {
  tunnelOrigin(origin);
  const fixture = await prepareCertificate(slot);
  const student = client();
  try {
    const login = await json(await student.call('/auth/login', 'POST', { email: fixture.email, password: fixture.password }));
    if (login.user?.id !== fixture.userId || login.user?.role !== 'STUDENT') throw new Error('Fictional QR owner identity differs.');
    const list = await json(await student.call('/certificates/my'), 200);
    const certificate = list.find(item => item.id === fixture.certificateId);
    if (!certificate || certificate.verificationUrl !== `${origin}/verify/${fixture.code}`) throw new Error('Actual certificate metadata does not match running tunnel origin.');
    for (const key of Object.keys(fixture.snapshot)) if (certificate[key] !== fixture.snapshot[key]) throw new Error('Certificate issuance snapshot changed.');
    const response = await student.call(`/certificates/${fixture.certificateId}/pdf`);
    if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/pdf')) throw new Error('Authorized certificate PDF download failed.');
    const pdf = path.join(DIRECTORY, pdfName(slot));
    if (fs.existsSync(pdf) && fs.lstatSync(pdf).isSymbolicLink()) throw new Error('QR PDF cannot be a symbolic link.');
    fs.writeFileSync(pdf, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
    const urlFile = path.join(DIRECTORY, slot === 'phone' ? 'phone-url.txt' : 'revocation-url.txt');
    if (fs.existsSync(urlFile) && fs.lstatSync(urlFile).isSymbolicLink()) throw new Error('QR URL file cannot be a symbolic link.');
    fs.writeFileSync(urlFile, `${certificate.verificationUrl}\n`, { mode: 0o600 });
    return { url: certificate.verificationUrl, pdf };
  } finally { await student.call('/auth/logout', 'POST', {}).catch(() => {}); }
}
module.exports = { prepareCertificate, refreshPDF, client, json, validateFixture };
