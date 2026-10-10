'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {
  FIXED_NEXT_ORIGIN,
  createGateway,
  discoverAssets,
  evaluateRequest,
  isUuid,
} = require('./qr-verification-gateway.cjs');

const CODE = '123e4567-e89b-12d3-a456-426614174000';
const REVOKED_CODE = '223e4567-e89b-42d3-a456-426614174001';
const UNPUBLISHED_CODE = '323e4567-e89b-42d3-a456-426614174002';
const ASSET = '/_next/static/chunks/verify-a1b2c3.js';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function rawRequest(port, rawPath, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path: rawPath, method, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.once('error', reject);
    request.end();
  });
}

function fakeResponse(statusCode, contentType, body, headers = {}) {
  return { statusCode, headers: { 'content-type': contentType, ...headers }, body: Buffer.from(body) };
}

test('implicit favicon is an exact empty local response and never proxied', async () => {
  const server = createGateway({ assets: new Set(), certificateCodes: new Set(), _requestUpstream: () => { throw new Error('Must not proxy icon'); } });
  const port = await listen(server);
  try {
    const response = await rawRequest(port, '/favicon.ico');
    assert.equal(response.status, 204); assert.equal(response.body, '');
    assert.match(response.headers['cache-control'], /no-store/);
    assert.equal((await rawRequest(port, '/favicon.ico?x=1')).status, 400);
    assert.equal((await rawRequest(port, '/favicon.ico', { method: 'POST' })).status, 405);
  } finally { await close(server); }
});

test('policy is default deny and accepts only exact read-only verification routes and assets', () => {
  const assets = new Set([ASSET]);
  assert.equal(isUuid(CODE), true);
  for (const [method, url, kind] of [
    ['GET', `/verify/${CODE}`, 'page'],
    ['HEAD', `/verify/${CODE}`, 'page'],
    ['GET', `/api/public/certificates/verify/${CODE}`, 'api'],
    ['GET', ASSET, 'asset'],
  ]) {
    assert.deepEqual(evaluateRequest({ method, url, headers: {} }, assets), {
      allowed: true, kind, upstreamPath: url, method,
    });
  }

  for (const url of [
    '/', '/dashboard', '/auth/login', '/admin', '/api/auth/login', '/api/certificates/my',
    '/api/ai/chat', '/socket.io/', '/metrics', '/debug', '/evidence/demo', '/.env', '/server.log',
    '/_next/static/chunks/private-dashboard.js', '/_next/static/chunks/verify-a1b2c3.js.map',
  ]) {
    assert.equal(evaluateRequest({ method: 'GET', url, headers: {} }, assets).allowed, false, url);
  }
});

test('policy rejects methods, bodies, upgrades, queries, malformed IDs, and ambiguous raw paths', () => {
  const assets = new Set([ASSET]);
  const rejected = [
    { method: 'POST', url: `/verify/${CODE}`, headers: {} },
    { method: 'GET', url: `/verify/${CODE}`, headers: { 'content-length': '1' } },
    { method: 'GET', url: `/verify/${CODE}`, headers: { 'transfer-encoding': 'chunked' } },
    { method: 'GET', url: `/verify/${CODE}`, headers: { connection: 'keep-alive, Upgrade', upgrade: 'websocket' } },
    { method: 'GET', url: `/verify/${CODE}`, headers: { rsc: '1', 'next-router-state-tree': '%5B%5D' } },
    { method: 'GET', url: `/verify/${CODE}`, headers: { 'next-router-prefetch': '1' } },
    { method: 'GET', url: `/verify/${CODE}?x=1`, headers: {} },
    { method: 'GET', url: `/verify/${CODE}?`, headers: {} },
    { method: 'GET', url: '/verify/not-a-uuid', headers: {} },
    { method: 'GET', url: `/verify/${CODE}/`, headers: {} },
    { method: 'GET', url: `/verify/%2e%2e%2fauth`, headers: {} },
    { method: 'GET', url: `/verify%2f${CODE}`, headers: {} },
    { method: 'GET', url: `/verify\\${CODE}`, headers: {} },
    { method: 'GET', url: `/verify/../${CODE}`, headers: {} },
    { method: 'GET', url: `//attacker.invalid/verify/${CODE}`, headers: {} },
  ];
  for (const request of rejected) assert.equal(evaluateRequest(request, assets).allowed, false, request.url);
});

test('gateway uses the fixed loopback upstream and never forwards visitor credentials or routing headers', async () => {
  let captured;
  const server = createGateway({ assets: new Set([ASSET]), certificateCodes: new Set([CODE]), _requestUpstream: async (url, options) => {
    captured = { url: url.href, options };
    return fakeResponse(200, 'text/html; charset=utf-8', '<!doctype html><title>Verifier</title>', {
      'set-cookie': ['session=secret; HttpOnly'], location: 'https://attacker.invalid/', server: 'private-next',
    });
  } });
  const port = await listen(server);
  try {
    const result = await rawRequest(port, `/verify/${CODE}`, { headers: {
      Host: 'attacker.invalid', Cookie: 'session=visitor', Authorization: 'Bearer visitor-secret',
      'X-Forwarded-Host': 'attacker.invalid', 'X-Forwarded-For': '203.0.113.10', Referer: 'https://attacker.invalid/',
    } });
    assert.equal(result.status, 200);
    assert.equal(result.body, '<!doctype html><title>Verifier</title>');
    assert.equal(captured.url, `${FIXED_NEXT_ORIGIN}/verify/${CODE}`);
    assert.deepEqual(Object.keys(captured.options.headers).sort(), ['Accept', 'Accept-Encoding', 'User-Agent'].sort());
    assert.equal(result.headers['set-cookie'], undefined);
    assert.equal(result.headers.location, undefined);
    assert.equal(result.headers.server, undefined);
    assert.equal(result.headers['cache-control'], 'no-store, max-age=0');
    assert.equal(result.headers['referrer-policy'], 'no-referrer');
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
    assert.equal(result.headers['x-frame-options'], 'DENY');
    assert.match(result.headers['x-robots-tag'], /noindex/);
    assert.match(result.headers['content-security-policy'], /connect-src 'self'/);
    assert.match(result.headers['content-security-policy'], /frame-ancestors 'none'/);
  } finally {
    await close(server);
  }
});

test('gateway publishes certificate data only for the explicit fictional fixture set', async () => {
  const calls = [];
  const valid = { valid: true, certificate: {
    recipientName: 'Fictional Learner', courseTitle: 'Fixture Course', issuerName: 'ProctoLearn',
    issuedAt: '2026-10-10T00:00:00.000Z', issuedVia: 'PROCTORED_EXAM',
  } };
  const revoked = { valid: false, status: 'REVOKED' };
  const server = createGateway({
    assets: new Set([ASSET]),
    certificateCodes: new Set([CODE, REVOKED_CODE]),
    _requestUpstream: async (url) => {
      calls.push(url.pathname);
      if (url.pathname === `/verify/${UNPUBLISHED_CODE}`) return fakeResponse(200, 'text/html', '<p>Public verifier</p>');
      if (url.pathname.endsWith(`/${CODE}`)) return fakeResponse(200, 'application/json', JSON.stringify(valid));
      if (url.pathname.endsWith(`/${REVOKED_CODE}`)) return fakeResponse(200, 'application/json', JSON.stringify(revoked));
      throw new Error('Unexpected upstream request');
    },
  });
  const port = await listen(server);
  try {
    let result = await rawRequest(port, `/api/public/certificates/verify/${UNPUBLISHED_CODE}`);
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(result.body), { valid: false });
    assert.deepEqual(calls, []);

    result = await rawRequest(port, `/verify/${UNPUBLISHED_CODE}`);
    assert.equal(result.status, 200);
    assert.match(result.body, /Public verifier/);

    result = await rawRequest(port, `/api/public/certificates/verify/${CODE}`);
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(result.body), valid);

    result = await rawRequest(port, `/api/public/certificates/verify/${REVOKED_CODE}`);
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(result.body), revoked);
    assert.deepEqual(calls, [
      `/verify/${UNPUBLISHED_CODE}`,
      `/api/public/certificates/verify/${CODE}`,
      `/api/public/certificates/verify/${REVOKED_CODE}`,
    ]);
  } finally {
    await close(server);
  }
});

test('gateway requires and validates the fictional certificate publication set', () => {
  assert.throws(() => createGateway({ assets: new Set([ASSET]) }), /certificateCodes must be a Set/);
  assert.throws(() => createGateway({ assets: new Set([ASSET]), certificateCodes: [CODE] }), /certificateCodes must be a Set/);
  assert.throws(() => createGateway({ assets: new Set([ASSET]), certificateCodes: new Set(['not-a-uuid']) }), /Invalid published certificate UUID/);
  const server = createGateway({ assets: new Set([ASSET]), certificateCodes: new Set() });
  assert.equal(server.maxConnections, 64);
  assert.equal(server.maxHeadersCount, 32);
  assert.equal(server.headersTimeout, 10_000);
  assert.equal(server.requestTimeout, 15_000);
  assert.equal(server.keepAliveTimeout, 5_000);
  assert.equal(server.maxRequestsPerSocket, 100);
  server.close();
});

test('gateway rejects excess concurrent upstream work and recovers after slots release', async () => {
  const pendingUpstreams = [];
  let blocking = true;
  let upstreamCalls = 0;
  const server = createGateway({
    assets: new Set([ASSET]),
    certificateCodes: new Set([CODE]),
    _requestUpstream: async () => {
      upstreamCalls += 1;
      if (!blocking) return fakeResponse(200, 'application/json', '{"valid":false}');
      return await new Promise((resolve) => pendingUpstreams.push(resolve));
    },
  });
  const port = await listen(server);
  try {
    const requests = Array.from({ length: 16 }, () =>
      rawRequest(port, `/api/public/certificates/verify/${CODE}`));
    while (pendingUpstreams.length < 16) await new Promise((resolve) => setImmediate(resolve));

    const overflow = await rawRequest(port, `/api/public/certificates/verify/${CODE}`);
    assert.equal(overflow.status, 503);
    assert.deepEqual(JSON.parse(overflow.body), { error: 'Verification service unavailable' });
    assert.equal(upstreamCalls, 16);

    blocking = false;
    for (const resolve of pendingUpstreams) resolve(fakeResponse(200, 'application/json', '{"valid":false}'));
    const completed = await Promise.all(requests);
    assert.equal(completed.every((response) => response.status === 200), true);

    const recovered = await rawRequest(port, `/api/public/certificates/verify/${CODE}`);
    assert.equal(recovered.status, 200);
    assert.equal(upstreamCalls, 17);
  } finally {
    await close(server);
  }
});

test('gateway cancels loopback work when the public client disconnects and releases the slot', async () => {
  let calls = 0;
  let blocking = true;
  let markAborted;
  const aborted = new Promise((resolve) => { markAborted = resolve; });
  const server = createGateway({
    assets: new Set([ASSET]),
    certificateCodes: new Set([CODE]),
    _requestUpstream: async (_url, options) => {
      calls += 1;
      if (!blocking) return fakeResponse(200, 'application/json', '{"valid":false}');
      return await new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {
        markAborted();
        reject(new Error('aborted'));
      }, { once: true }));
    },
  });
  const port = await listen(server);
  try {
    const disconnected = http.request({
      host: '127.0.0.1', port, path: `/api/public/certificates/verify/${CODE}`, method: 'GET',
    });
    disconnected.on('error', () => {});
    disconnected.end();
    while (calls === 0) await new Promise((resolve) => setImmediate(resolve));
    disconnected.destroy();
    await aborted;
    await new Promise((resolve) => setImmediate(resolve));

    blocking = false;
    const recovered = await rawRequest(port, `/api/public/certificates/verify/${CODE}`);
    assert.equal(recovered.status, 200);
    assert.equal(calls, 2);
  } finally {
    await close(server);
  }
});

test('gateway strips redirects and internal upstream failures', async () => {
  let mode = 'redirect';
  const server = createGateway({ assets: new Set([ASSET]), certificateCodes: new Set([CODE]), _requestUpstream: async () => {
    if (mode === 'redirect') return fakeResponse(302, 'text/html', 'private redirect body', { location: 'http://127.0.0.1:3000/auth/login' });
    if (mode === 'failure') return fakeResponse(500, 'application/json', '{"stack":"PRIVATE_STACK","database":"postgres"}');
    throw new Error('connect ECONNREFUSED 127.0.0.1:3000');
  } });
  const port = await listen(server);
  try {
    let result = await rawRequest(port, `/verify/${CODE}`);
    assert.equal(result.status, 502);
    assert.equal(result.headers.location, undefined);
    assert.doesNotMatch(result.body, /private|127\.0\.0\.1/i);

    mode = 'failure';
    result = await rawRequest(port, `/api/public/certificates/verify/${CODE}`);
    assert.equal(result.status, 503);
    assert.deepEqual(JSON.parse(result.body), { error: 'Verification service unavailable' });
    assert.doesNotMatch(result.body, /stack|postgres/i);

    mode = 'error';
    result = await rawRequest(port, `/api/public/certificates/verify/${CODE}`);
    assert.equal(result.status, 503);
    assert.doesNotMatch(result.body, /ECONNREFUSED|127\.0\.0\.1/);
  } finally {
    await close(server);
  }
});

test('gateway rejects an unexpected upstream content type and sends no body for HEAD', async () => {
  let wrongType = true;
  const server = createGateway({ assets: new Set([ASSET]), certificateCodes: new Set([CODE]), _requestUpstream: async (_url, options) => {
    assert.equal(options.method, wrongType ? 'GET' : 'HEAD');
    return fakeResponse(200, wrongType ? 'application/json' : 'text/html', wrongType ? '{}' : '<p>page</p>');
  } });
  const port = await listen(server);
  try {
    let result = await rawRequest(port, `/verify/${CODE}`);
    assert.equal(result.status, 502);
    wrongType = false;
    result = await rawRequest(port, `/verify/${CODE}`, { method: 'HEAD' });
    assert.equal(result.status, 200);
    assert.equal(result.body, '');
    assert.equal(result.headers['content-length'], String(Buffer.byteLength('<p>page</p>')));
  } finally {
    await close(server);
  }
});

test('raw blocked paths never reach the upstream', async () => {
  let calls = 0;
  const server = createGateway({ assets: new Set([ASSET]), certificateCodes: new Set([CODE]), _requestUpstream: async () => {
    calls += 1;
    return fakeResponse(200, 'text/html', 'unexpected');
  } });
  const port = await listen(server);
  try {
    const probes = [
      '/dashboard', '/api/auth/login', `/verify/${CODE}?__rsc=abc`, '/verify/%2e%2e%2fauth/login',
      '/_next/static/chunks/private-dashboard.js',
    ];
    for (const probe of probes) {
      const result = await rawRequest(port, probe);
      assert.ok(result.status === 400 || result.status === 404, probe);
    }
    assert.equal(calls, 0);
  } finally {
    await close(server);
  }
});

test('asset discovery combines rendered HTML with only verification route build references', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proctolearn-qr-assets-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const write = (relative, contents = '') => {
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };
  write('static/chunks/runtime-111.js', 'globalThis.__runtime = true');
  write('static/chunks/verify-222.js', 'import("/_next/static/chunks/dynamic-333.js"); //# sourceMappingURL=verify-222.js.map');
  write('static/chunks/dynamic-333.js', 'globalThis.__verify = true');
  write('static/chunks/verify-444.css', '@font-face{src:url(../media/inter-555.woff2)}');
  write('static/media/inter-555.woff2', Buffer.from([0, 1, 2]));
  write('static/chunks/private-dashboard.js', 'PRIVATE');
  write('server/app/verify/[code]/page_client-reference-manifest.js',
    'manifest={chunks:["/_next/static/chunks/verify-222.js"],entryCSSFiles:[{"path":"static/chunks/verify-444.css"}]}');
  write('server/next-font-manifest.json', JSON.stringify({ app: {
    '[project]/src/app/verify/[code]/page': ['static/media/inter-555.woff2'],
    '[project]/src/app/dashboard/page': ['static/media/private-font.woff2'],
  } }));

  let requested;
  const assets = await discoverAssets({ code: CODE, nextDir: directory, _requestUpstream: async (url, options) => {
    requested = { url: url.href, options };
    return fakeResponse(200, 'text/html; charset=utf-8',
      '<link rel="stylesheet" href="/_next/static/chunks/verify-444.css"><script src="/_next/static/chunks/runtime-111.js"></script>');
  } });
  assert.equal(requested.url, `${FIXED_NEXT_ORIGIN}/verify/${CODE}`);
  assert.equal(requested.options.method, 'GET');
  assert.deepEqual([...assets].sort(), [
    '/_next/static/chunks/dynamic-333.js',
    '/_next/static/chunks/runtime-111.js',
    '/_next/static/chunks/verify-222.js',
    '/_next/static/chunks/verify-444.css',
    '/_next/static/media/inter-555.woff2',
  ]);
  assert.equal(assets.has('/_next/static/chunks/private-dashboard.js'), false);
  assert.equal([...assets].some((asset) => asset.endsWith('.map')), false);
});

test('asset discovery fails closed on redirects and missing manifest assets', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proctolearn-qr-assets-bad-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await assert.rejects(discoverAssets({ code: CODE, nextDir: directory, _requestUpstream: async () =>
    fakeResponse(302, 'text/html', '', { location: '/auth/login' }) }), /did not return HTML/);

  fs.mkdirSync(path.join(directory, 'server/app/verify/[code]'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'server/app/verify/[code]/page_client-reference-manifest.js'),
    'manifest={chunks:["/_next/static/chunks/missing.js"]}');
  fs.writeFileSync(path.join(directory, 'server/next-font-manifest.json'), JSON.stringify({ app: {
    '[project]/src/app/verify/[code]/page': [],
  } }));
  await assert.rejects(discoverAssets({ code: CODE, nextDir: directory, _requestUpstream: async () =>
    fakeResponse(200, 'text/html', '<script src="/_next/static/chunks/missing.js"></script>') }), /missing from the current build/);
});
