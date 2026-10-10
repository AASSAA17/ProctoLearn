#!/usr/bin/env node
'use strict';
// Temporary anonymous verifier only. Private runtime state never belongs in Git.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const ROOT = path.resolve(__dirname, '..');
const DIRECTORY = path.join(ROOT, '.local/qr-phone-demo');
const RELEASE = path.join(ROOT, '.local/release-demo');
const SESSION = path.join(DIRECTORY, 'session.json');
const STOP = path.join(DIRECTORY, 'stop-request');
const KIND = 'proctolearn-qr-phone-v1';
const PROBE = '00000000-0000-4000-8000-000000000000';
const CF_VERSION = '2026.10.0';
const CF_SHA = '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c';
const TOOL = path.join(ROOT, `.local/tools/cloudflared-${CF_VERSION}/cloudflared.exe`);
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const releaseState = () => read(path.join(RELEASE, 'running.json'));

function prepare() {
  const marker = path.join(DIRECTORY, 'ownership.json');
  if (!fs.existsSync(marker)) {
    if (fs.existsSync(DIRECTORY) && fs.readdirSync(DIRECTORY).length) throw new Error('Unmarked QR directory; refusing adoption.');
    fs.mkdirSync(DIRECTORY, { recursive: true });
    fs.writeFileSync(marker, JSON.stringify({ kind: KIND }), { flag: 'wx', mode: 0o600 });
  }
  if (fs.lstatSync(DIRECTORY).isSymbolicLink() || read(marker).kind !== KIND) throw new Error('QR ownership marker mismatch.');
  if (read(path.join(RELEASE, 'ownership.json')).kind !== 'proctolearn-isolated-release-v1') throw new Error('Owned release profile required.');
}
function tunnelOrigin(value) {
  if (typeof value !== 'string' || !/^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(value)) throw new Error('Invalid session tunnel origin.');
  return value;
}
function distinctFixtures(fixtures) {
  for (const key of ['userId', 'certificateId', 'code']) if (new Set(fixtures.map(fixture => fixture[key])).size !== 2) throw new Error('Phone and revocation fixtures must be distinct.');
}
async function request(url, expected = 200) {
  const response = await fetch(url, { redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (response.status !== expected) { await response.body?.cancel(); throw new Error(`Reachability failed: HTTP ${response.status}.`); }
  return response;
}
async function localReady() {
  const state = releaseState();
  if (!state.ready || state.mode !== 'application' || state.restored || !alive(state.pid)) throw new Error('Start the original release application first.');
  await (await request('http://127.0.0.1:4000/ready')).body?.cancel();
  await (await request(`http://127.0.0.1:3000/verify/${PROBE}`)).body?.cancel();
  return state;
}
async function tool() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This pinned helper currently supports Windows x64.');
  if (!fs.existsSync(TOOL)) {
    fs.mkdirSync(path.dirname(TOOL), { recursive: true });
    const response = await fetch(`https://github.com/cloudflare/cloudflared/releases/download/${CF_VERSION}/cloudflared-windows-amd64.exe`, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error('Official cloudflared download failed.');
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > 100 * 1024 * 1024 || createHash('sha256').update(data).digest('hex') !== CF_SHA) throw new Error('cloudflared checksum mismatch.');
    fs.writeFileSync(TOOL, data, { flag: 'wx' });
  }
  if (createHash('sha256').update(fs.readFileSync(TOOL)).digest('hex') !== CF_SHA) throw new Error('Installed project-local cloudflared checksum mismatch.');
  for (const file of ['config.yml', 'config.yaml']) {
    if (fs.existsSync(path.join(os.homedir(), '.cloudflared', file))) throw new Error(`Existing ~/.cloudflared/${file} conflicts with this isolated Quick Tunnel; configuration was not changed.`);
  }
  return TOOL;
}
function localRaw(port, target, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: target, method, timeout: 15000 }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    req.on('timeout', () => req.destroy(new Error('Gateway probe timed out.')));
    req.on('error', reject); req.end();
  });
}
async function boundaryCheck(port, assets, fixtures = []) {
  for (const target of ['/dashboard', '/auth/login', '/api/docs', '/api/public/certificates/verify/bad', '/certificates/my', '/admin/users', '/ai/chat', '/socket.io/', '/evidence', '/metrics', '/.env', '/logs', '/_next/static/test.js.map', `/verify/%2e%2e/auth/login`, `/verify/${PROBE}?url=http://localhost:4000/admin`, `http://localhost:4000/verify/${PROBE}`, `/verify/${PROBE}%2f..`]) {
    if (![400, 404, 405].includes(await localRaw(port, target))) throw new Error('Gateway denied-route preflight failed.');
  }
  if (await localRaw(port, `/verify/${PROBE}`, 'POST') !== 405) throw new Error('Gateway method preflight failed.');
  for (const target of [`/verify/${PROBE}`, `/api/public/certificates/verify/${PROBE}`, ...assets]) {
    if (await localRaw(port, target) !== 200) throw new Error('Gateway allowed-route preflight failed.');
  }
  for (const fixture of fixtures) {
    const data = await (await request(`http://127.0.0.1:${port}/api/public/certificates/verify/${fixture.code}`)).json();
    if (data.valid !== true && data.status !== 'REVOKED') throw new Error('Listed fictional certificate data preflight failed.');
  }
}
function runRelease(command, expectedState) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts/demo-release.cjs'), command, ...(expectedState ? [`${expectedState.pid}@${expectedState.startedAt}`] : [])], { cwd: ROOT, windowsHide: true, stdio: 'ignore' });
    child.once('error', () => reject(new Error('Release command failed.')));
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Release command failed.')));
  });
}
async function launchRelease(origin, aiProvider, onSpawn) {
  const log = fs.openSync(path.join(DIRECTORY, 'release.log'), 'a');
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts/demo-release.cjs'), 'start'], {
    cwd: ROOT, windowsHide: true, detached: true, stdio: ['ignore', log, log],
    env: { ...process.env, DEMO_PUBLIC_APP_URL: origin, DEMO_AI_PROVIDER: aiProvider },
  });
  fs.closeSync(log); child.unref();
  onSpawn?.(child.pid);
  let failed = false; child.once('error', () => { failed = true; });
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline && !failed) {
    try { const state = releaseState(); if (state.pid === child.pid && state.ready) { await localReady(); return state; } } catch {}
    if (child.exitCode !== null || child.signalCode !== null) break;
    await delay(500);
  }
  throw new Error('Controlled release restart failed; inspect private QR release.log.');
}
async function publicCheck(origin, assets, fixtures) {
  tunnelOrigin(origin);
  const html = await (await request(`${origin}/verify/${PROBE}`)).text();
  if (!html.includes('Сертификатты тексеру')) throw new Error('Public verifier HTML missing.');
  const response = await request(`${origin}/api/public/certificates/verify/${PROBE}`);
  if (!(response.headers.get('cache-control') || '').includes('no-store') || (await response.json()).valid !== false) throw new Error('Public bridge response invalid.');
  for (const asset of assets) await (await request(origin + asset)).body?.cancel();
  for (const fixture of fixtures) {
    const route = `/api/public/certificates/verify/${fixture.code}`;
    const local = await (await request(`http://127.0.0.1:3000${route}`)).json();
    const published = await (await request(origin + route)).json();
    assert.deepEqual(published, local, 'Published fictional certificate must match actual local verification');
    if (published.valid) {
      for (const key of ['recipientName', 'courseTitle', 'issuedAt', 'issuedVia']) if (published.certificate[key] !== fixture.snapshot[key]) throw new Error('Published certificate facts differ from immutable fixture snapshot.');
    } else if (published.status !== 'REVOKED') throw new Error('Listed fictional certificate was not found.');
  }
  for (const target of ['/auth/login', '/dashboard/admin', '/ai/chat', '/api/docs', '/certificates/my', '/metrics']) await (await request(origin + target, 404)).body?.cancel();
}
function safeCloudEnvironment() {
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) if (process.env[key]) env[key] = process.env[key];
  return env;
}
async function start() {
  prepare();
  if (fs.existsSync(SESSION)) {
    const existing = read(SESSION);
    if (alive(existing.pid)) { await check(); return; }
    throw new Error('A stopped QR session record remains. Inspect owned state before another start; no unrelated PID was killed.');
  }
  const previous = await localReady();
  const executable = await tool();
  const { prepareCertificate, refreshPDF } = require('./qr-demo-certificate.cjs');
  const fixtures = [await prepareCertificate(), await prepareCertificate('revocation')];
  distinctFixtures(fixtures);
  const { discoverAssets, createGateway } = require('./qr-verification-gateway.cjs');
  const assets = await discoverAssets({ code: PROBE });
  const gateway = createGateway({ assets, certificateCodes: new Set(fixtures.map(fixture => fixture.code)) });
  await new Promise((resolve, reject) => { gateway.once('error', reject); gateway.listen(0, '127.0.0.1', resolve); });
  const port = gateway.address().port;
  let tunnel, interval, origin, startedRelease, shuttingDown = false;
  const session = { kind: KIND, id: randomUUID(), pid: process.pid, startedAt: new Date().toISOString(), gatewayPort: port, assets: [...assets], ready: false,
    previousOrigin: previous.certificateOrigin || 'http://localhost:3000', previousAiProvider: previous.aiProvider || 'off', certificateCodes: fixtures.map(fixture => fixture.code) };
  fs.writeFileSync(SESSION, JSON.stringify(session), { flag: 'wx', mode: 0o600 });
  if (fs.existsSync(STOP)) fs.unlinkSync(STOP);
  const save = () => fs.writeFileSync(SESSION, JSON.stringify(session), { mode: 0o600 });
  let finish;
  const stopped = new Promise(resolve => { finish = resolve; });
  async function cleanup() {
    if (shuttingDown) return stopped;
    shuttingDown = true; clearInterval(interval);
    if (tunnel && tunnel.exitCode === null && tunnel.signalCode === null) {
      await new Promise(resolve => { const timer = setTimeout(resolve, 5000); tunnel.once('exit', () => { clearTimeout(timer); resolve(); }); tunnel.kill(); });
    }
    gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve));
    let recovered = true;
    try {
      const current = fs.existsSync(path.join(RELEASE, 'running.json')) ? releaseState() : null;
      if (startedRelease && (!current || current.pid === startedRelease.pid && current.certificateOrigin === origin)) {
        if (current && alive(current.pid)) await runRelease('stop', current);
        await launchRelease(session.previousOrigin, session.previousAiProvider);
        console.log('Prior certificate origin restored; local application remains running.');
      } else if (startedRelease) console.log('Owner changed the application session; temporary origin was not overwritten.');
    } catch {
      recovered = false; session.ready = false; session.recoveryNeeded = true; save();
      console.error('Origin recovery failed; private session.json retained with prior settings. Inspect it before another start.');
      process.exitCode = 1;
    }
    if (recovered && fs.existsSync(SESSION) && read(SESSION).id === session.id) fs.unlinkSync(SESSION);
    if (fs.existsSync(STOP)) fs.unlinkSync(STOP);
    console.log('QR gateway/tunnel stopped. Temporary QR addresses no longer work.');
    finish();
  }
  const onSignal = () => { void cleanup(); };
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  try {
    await boundaryCheck(port, assets, fixtures);
    console.log('Pre-publication PASS: GET/HEAD /verify/<UUID>, exact verifier JS/CSS/font assets and read-only data for the two dedicated fictional certificate codes only. Other UUIDs return not-found locally; all private routes/methods and WebSockets denied. Traffic passes through Cloudflare.');
    let observed = '';
    const cloudLog = fs.createWriteStream(path.join(DIRECTORY, 'cloudflared.log'), { flags: 'w', mode: 0o600 });
    tunnel = spawn(executable, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`, '--metrics', '127.0.0.1:0', '--protocol', 'http2', '--management-diagnostics=false'], { cwd: DIRECTORY, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: safeCloudEnvironment() });
    session.tunnelPid = tunnel.pid; save();
    tunnel.once('error', () => { observed += '\nTUNNEL_PROCESS_FAILED'; });
    for (const stream of [tunnel.stdout, tunnel.stderr]) stream.on('data', chunk => { cloudLog.write(chunk); observed = (observed + chunk.toString()).slice(-65536); });
    tunnel.once('exit', () => { cloudLog.end(); if (session.ready && !shuttingDown) { console.error('Tunnel exited; temporary URL is unavailable.'); void cleanup(); } });
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const match = observed.match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com/);
      if (match) { origin = tunnelOrigin(match[0]); break; }
      if (tunnel.exitCode !== null || observed.includes('TUNNEL_PROCESS_FAILED')) break;
      await delay(250);
    }
    if (!origin) throw new Error('This tunnel process did not provide a validated HTTPS hostname; inspect private cloudflared.log.');
    session.origin = origin; save();
    // Guard against an owner restart during preflight/tunnel discovery.
    if (releaseState().pid !== previous.pid) throw new Error('Application session changed during startup; restart was cancelled.');
    await runRelease('stop', previous);
    startedRelease = await launchRelease(origin, session.previousAiProvider, pid => { startedRelease = { pid }; session.appPid = pid; save(); });
    session.appPid = startedRelease.pid; save();
    let healthy = false;
    const publicDeadline = Date.now() + 90000;
    while (Date.now() < publicDeadline && !shuttingDown) {
      try { await publicCheck(origin, assets, fixtures); healthy = true; break; } catch { await delay(2000); }
    }
    if (!healthy) throw new Error('Public HTTPS verification did not become healthy within the bound.');
    const certificate = await refreshPDF(origin);
    await refreshPDF(origin, 'revocation');
    session.ready = true; save();
    console.log(`QR demo ready: ${certificate.url}`);
    console.log(`Fresh authorized PDF: ${certificate.pdf}`);
    console.log('Re-download the certificate PDF in the local laptop dashboard. Old PDF bytes keep their old QR. Keep application, gateway and tunnel running. Physical scan is AWAITING_OPERATOR.');
    interval = setInterval(() => { if (fs.existsSync(STOP)) void cleanup(); }, 250);
    await stopped;
  } catch (error) { await cleanup(); throw error; }
  finally { process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal); }
}
async function check() {
  prepare();
  if (!fs.existsSync(SESSION)) throw new Error('QR demonstration is not running.');
  const session = read(SESSION);
  if (session.kind !== KIND || !session.ready || !alive(session.pid) || !alive(session.tunnelPid)) throw new Error('Owned QR processes are not ready.');
  const current = await localReady();
  if (current.pid !== session.appPid || current.certificateOrigin !== session.origin) throw new Error('Effective certificate origin differs from this tunnel session.');
  const { validateFixture } = require('./qr-demo-certificate.cjs');
  const fixtures = [validateFixture(read(path.join(DIRECTORY, 'certificate.json')), 'phone'), validateFixture(read(path.join(DIRECTORY, 'revocation-certificate.json')), 'revocation')];
  distinctFixtures(fixtures);
  assert.deepEqual(fixtures.map(fixture => fixture.code), session.certificateCodes, 'Published fictional certificate set differs.');
  await boundaryCheck(session.gatewayPort, session.assets, fixtures);
  await publicCheck(session.origin, session.assets, fixtures);
  console.log(`PASS: owned gateway/tunnel, local upstream, public HTTPS assets/bridge, denied private routes, effective origin ${session.origin}. Phone scan AWAITING_OPERATOR.`);
}
async function stop() {
  prepare();
  if (!fs.existsSync(SESSION)) { console.log('No QR session to stop.'); return; }
  const session = read(SESSION);
  if (!alive(session.pid)) throw new Error('Supervisor is no longer alive; inspect the recorded owned processes privately. No unrelated process was killed.');
  fs.writeFileSync(STOP, session.id, { mode: 0o600 });
  const deadline = Date.now() + 210000;
  while (fs.existsSync(SESSION) && Date.now() < deadline) {
    if (read(SESSION).recoveryNeeded) throw new Error('QR stopped but origin recovery failed; prior configuration retained in private session.json.');
    await delay(500);
  }
  if (fs.existsSync(SESSION)) throw new Error('QR stop/recovery did not complete; inspect private state.');
  console.log('Stopped this QR session. Local application/data retained; old temporary QR URLs are unavailable.');
}
async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !['start', 'check', 'stop'].includes(args[0])) throw new Error('Use node scripts/qr-phone-demo.cjs start|check|stop');
  await ({ start, check, stop })[args[0]]();
}
module.exports = { tunnelOrigin, safeCloudEnvironment, boundaryCheck, distinctFixtures, main };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
