'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHash, randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { routeRequest, safeTarget, createPilotProxy } = require('./pilot-proxy.cjs');

let api, web, proxy, lastUpgrade;
const upgradeSockets = new Set();
async function listen(server, port = 0) { server.listen(port, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }
async function close(server) { if (!server) return; server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }

before(async () => {
  api = http.createServer((request, response) => {
    let bytes = 0;
    request.on('data', chunk => { bytes += chunk.length; });
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      response.setHeader('set-cookie', '__Host-pl-access=opaque; Path=/; Secure; HttpOnly; SameSite=Lax');
      response.end(JSON.stringify({ path: request.url, method: request.method, bytes, cookie: request.headers.cookie || null,
        csrf: request.headers['x-csrf-token'] || null, forwardedFor: request.headers['x-forwarded-for'], forwardedHost: request.headers['x-forwarded-host'], providerSecret: request.headers['x-proctolearn-gateway'] || null,
        range: request.headers.range || null }));
    });
  });
  api.on('upgrade', (request, socket) => {
    upgradeSockets.add(socket); socket.once('close', () => upgradeSockets.delete(socket));
    if (request.url.includes('reject=1')) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    lastUpgrade = { cookie: request.headers.cookie, origin: request.headers.origin, forwardedFor: request.headers['x-forwarded-for'] };
    const key = request.headers['sec-websocket-key'];
    const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  });
  web = http.createServer((request, response) => {
    if (request.url.startsWith('/courses?headers=1')) {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ rsc: request.headers.rsc, tree: request.headers['next-router-state-tree'], nextUrl: request.headers['next-url'] }));
      return;
    }
    response.end('pilot-web');
  });
  await listen(api, 4100); await listen(web, 3100);
  proxy = createPilotProxy(); await listen(proxy);
});
after(async () => { for (const socket of upgradeSockets) socket.destroy(); await close(proxy); await close(api); await close(web); });

test('route policy exposes learner flow and denies staff, diagnostics and importer', () => {
  for (const [method, path] of [['GET', '/'], ['GET', '/dashboard/courses/x/learn'], ['POST', '/api/auth/register'], ['GET', '/api/enrollments/my'], ['PUT', '/api/evidence/uploads/u/chunks/0']]) {
    assert.ok(routeRequest(method, path).upstream, `${method} ${path}`);
  }
  for (const [method, path] of [['GET', '/dashboard/admin'], ['GET', '/dashboard/teacher/courses'], ['GET', '/dashboard/proctor'], ['GET', '/auth/forgot-password'], ['GET', '/auth/reset-password'], ['POST', '/api/auth/forgot-password'], ['POST', '/api/auth/reset-password'], ['POST', '/api/content-import/draft'], ['GET', '/api/metrics'], ['GET', '/api/admin/users'], ['GET', '/api/pilot/overview'], ['GET', '/api/courses/manage']]) {
    assert.equal(routeRequest(method, path).status, 404, `${method} ${path}`);
  }
});

test('loopback mode exposes exact staff workflows while public routing keeps them closed', async () => {
  const localStaff = { localStaff: true };
  for (const [method, path] of [
    ['GET', '/dashboard/admin/pilot'], ['GET', '/dashboard/teacher/courses/c/edit'], ['GET', '/dashboard/proctor/evidence/a'],
    ['GET', '/api/pilot/overview'], ['POST', '/api/pilot/invitations'], ['POST', '/api/content-import/draft'],
    ['GET', '/api/courses/manage?limit=100'], ['PATCH', '/api/courses/c'], ['POST', '/api/courses/c/exams'],
    ['POST', '/api/lessons/l/steps'], ['GET', '/api/proctor/sessions/a'], ['POST', '/api/proctor/sessions/a/review'],
  ]) assert.ok(routeRequest(method, path, localStaff).upstream, `${method} ${path}`);

  for (const [method, path] of [
    ['GET', '/api/admin/export/users'], ['POST', '/api/content-import/anything'], ['DELETE', '/api/pilot/members/u'],
    ['GET', '/api/metrics'], ['GET', '/api/docs'],
  ]) assert.equal(routeRequest(method, path, localStaff).status, 404, `${method} ${path}`);

  const base = `http://127.0.0.1:${proxy.address().port}`;
  assert.equal(await (await fetch(`${base}/dashboard/admin/pilot`)).text(), 'pilot-web');
  assert.equal((await fetch(`${base}/api/pilot/overview`)).status, 200);

  const secret = 'b'.repeat(43);
  const publicProxy = createPilotProxy({ publicOrigin: 'https://assigned.example.test', gatewaySecret: secret });
  const port = await listen(publicProxy);
  const headers = { 'x-proctolearn-gateway': secret, 'x-proctolearn-client-ip': '198.51.100.7' };
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/dashboard/admin/pilot`, { headers })).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/pilot/overview`, { headers })).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/content-import/draft`, { method: 'POST', headers })).status, 404);
  } finally { await close(publicProxy); }
});

test('malformed, traversal, source map and non-allowlisted methods fail closed', () => {
  for (const target of ['//evil.invalid/', '/%2fadmin', '/dashboard/%61dmin', '/api/../admin', '/a\\b', '/%00']) assert.equal(safeTarget(target), null, target);
  assert.equal(routeRequest('GET', '/_next/static/app.js.map').status, 404);
  assert.equal(routeRequest('TRACE', '/').status, 405);
});

test('same-origin proxy preserves cookies, CSRF, method/body/range and sanitizes forwarding', async () => {
  const base = `http://127.0.0.1:${proxy.address().port}`;
  const body = JSON.stringify({ invitationToken: 'opaque', payload: 'x'.repeat(16_000) });
  const registration = await fetch(`${base}/api/auth/register`, { method: 'POST', body, headers: { 'content-type': 'application/json', cookie: 'pl-csrf=opaque', 'x-csrf-token': 'signed', 'x-forwarded-for': '203.0.113.9' } });
  assert.equal(registration.status, 200);
  const data = await registration.json();
  assert.equal(data.path, '/auth/register'); assert.equal(data.method, 'POST'); assert.equal(data.bytes, Buffer.byteLength(body));
  assert.equal(data.cookie, 'pl-csrf=opaque'); assert.equal(data.csrf, 'signed'); assert.equal(data.forwardedFor, '127.0.0.1'); assert.equal(data.providerSecret, null);
  assert.match(registration.headers.get('set-cookie'), /HttpOnly/);
  const ranged = await fetch(`${base}/api/certificates/c/pdf`, { headers: { range: 'bytes=2-9' } });
  assert.equal((await ranged.json()).range, 'bytes=2-9');
  assert.equal(await (await fetch(`${base}/courses`)).text(), 'pilot-web');
});

test('Next client navigation headers survive only for a bounded allowlisted page target', async () => {
  const base = `http://127.0.0.1:${proxy.address().port}`;
  const goodResponse = await fetch(`${base}/courses?headers=1`, { headers: {
    rsc: '1', 'next-router-state-tree': '["",{}]', 'next-url': '/dashboard/courses',
  } });
  const goodText = await goodResponse.text();
  assert.equal(goodResponse.status, 200, goodText);
  assert.notEqual(goodText, '');
  const good = JSON.parse(goodText);
  assert.deepEqual(good, { rsc: '1', tree: '["",{}]', nextUrl: '/dashboard/courses' });
  const rejected = await (await fetch(`${base}/courses?headers=1`, { headers: {
    rsc: '1', 'next-router-state-tree': 'x'.repeat(8193), 'next-url': '/dashboard/%61dmin',
  } })).json();
  assert.deepEqual(rejected, { rsc: '1' });
});

test('request bounds reject oversized JSON before it reaches the API', async () => {
  const result = await fetch(`http://127.0.0.1:${proxy.address().port}/api/auth/login`, { method: 'POST', body: Buffer.alloc(2 * 1024 * 1024 + 1) });
  assert.equal(result.status, 413);
});

test('chunked body limit returns 413 without crashing and the next request succeeds', async () => {
  const status = await new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: proxy.address().port, path: '/api/auth/login', method: 'POST', headers: { 'content-type': 'application/octet-stream' } }, response => {
      response.resume(); response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject);
    for (let index = 0; index < 33; index += 1) request.write(Buffer.alloc(64 * 1024));
    request.end();
  });
  assert.equal(status, 413);
  assert.equal((await fetch(`http://127.0.0.1:${proxy.address().port}/api/auth/csrf`)).status, 200);
});

function websocketAttempt(port, path) {
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString('base64');
    const request = http.request({ host: '127.0.0.1', port, path, headers: {
      connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-key': key, 'sec-websocket-version': '13',
      cookie: 'pl-access=opaque', origin: 'http://127.0.0.1:3200',
    } });
    request.once('upgrade', (response, socket) => { const status = response.statusCode; socket.destroy(); resolve(status); });
    request.once('response', response => { response.resume(); response.once('end', () => resolve(response.statusCode)); });
    request.once('error', reject);
    request.end();
  });
}

test('WebSocket upgrade preserves handshake/auth headers and rejected upgrades release capacity', async () => {
  assert.equal(await websocketAttempt(proxy.address().port, '/socket.io/?EIO=4&transport=websocket'), 101);
  assert.deepEqual(lastUpgrade, { cookie: 'pl-access=opaque', origin: 'http://127.0.0.1:3200', forwardedFor: '127.0.0.1' });
  await Promise.all(Array.from({ length: 65 }, () => websocketAttempt(proxy.address().port, '/socket.io/?reject=1').catch(() => null)));
  assert.equal((await fetch(`http://127.0.0.1:${proxy.address().port}/api/auth/csrf`)).status, 200);
});

test('HTTPS public mode requires edge-injected secret and client IP, ignoring visitor forwarding', async () => {
  const secret = 'a'.repeat(43);
  const publicProxy = createPilotProxy({ publicOrigin: 'https://assigned.example.test', gatewaySecret: secret });
  const port = await listen(publicProxy);
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/auth/csrf`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/auth/csrf`, { headers: { 'x-proctolearn-gateway': secret, 'x-forwarded-for': '198.51.100.8' } })).status, 404);
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/csrf`, { headers: {
      'x-proctolearn-gateway': secret,
      'x-proctolearn-client-ip': '198.51.100.7',
      'x-forwarded-for': '203.0.113.99, 127.0.0.1',
    } });
    const data = await response.json();
    assert.equal(data.forwardedFor, '198.51.100.7'); assert.equal(data.forwardedHost, 'assigned.example.test'); assert.equal(data.providerSecret, null);
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
    const second = await fetch(`http://127.0.0.1:${port}/api/auth/csrf`, { headers: {
      'x-proctolearn-gateway': secret,
      'x-proctolearn-client-ip': '198.51.100.8',
      'x-forwarded-for': '198.51.100.7',
    } });
    assert.equal((await second.json()).forwardedFor, '198.51.100.8');
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/auth/csrf`, { headers: {
      'x-proctolearn-gateway': secret,
      'x-proctolearn-client-ip': '198.51.100.8, 203.0.113.1',
    } })).status, 404);
  } finally { await close(publicProxy); }
});
