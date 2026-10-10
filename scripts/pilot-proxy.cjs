#!/usr/bin/env node
'use strict';

const http = require('node:http');
const { Transform } = require('node:stream');
const { isIP } = require('node:net');

const API_ORIGIN = Object.freeze({ hostname: '127.0.0.1', port: 4100 });
const WEB_ORIGIN = Object.freeze({ hostname: '127.0.0.1', port: 3100 });
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const ID = '[A-Za-z0-9_-]{1,100}';
const re = (source) => new RegExp(`^${source}$`, 'i');

const apiRules = [
  ['GET', re('auth/(?:csrf|me)')],
  ['POST', re('auth/(?:login|register|refresh|logout|change-password)')],
  ['GET', re('courses(?:\\?.*)?')],
  ['GET', re(`courses/${ID}(?:/overview|/material)?(?:\\?.*)?`)],
  ['GET', re(`courses/${ID}/lessons(?:/progress/my|/${ID})?(?:\\?.*)?`)],
  ['POST', re(`courses/${ID}/lessons/${ID}/(?:check-assignment|complete)`)],
  ['GET', re(`lessons/${ID}`)],
  ['GET', re(`steps/${ID}`)],
  ['POST', re(`steps/${ID}/(?:submit|complete)`)],
  ['GET', re(`submissions/(?:step/${ID}|lesson/${ID}/progress|course/${ID}/progress)`)],
  ['GET', re(`enrollments/(?:my|active|check/${ID})`)],
  ['POST', re(`enrollments/(?:courses/${ID}|complete/${ID})`)],
  ['DELETE', re(`enrollments/courses/${ID}`)],
  ['GET', re(`attempts/(?:preflight/${ID}|my|${ID}(?:/draft)?)`)],
  ['POST', re(`attempts/(?:start/${ID}|${ID}/submit)`)],
  ['PATCH', re(`attempts/${ID}/draft`)],
  ['GET', re(`proctor/sessions/${ID}/appeal`)],
  ['POST', re(`proctor/sessions/${ID}/appeal`)],
  ['POST', re(`evidence/${ID}/uploads`)],
  ['GET', re(`evidence/(?:${ID}/uploads|uploads/${ID})`)],
  ['PUT', re(`evidence/uploads/${ID}/chunks/[0-9]{1,5}`)],
  ['POST', re(`evidence/uploads/${ID}/(?:complete|abort)`)],
  ['GET', re('certificates/my')],
  ['GET', re(`certificates/${ID}/pdf`)],
  ['GET', re('notifications(?:\\?.*)?')],
  ['PATCH', re(`notifications/${ID}/read`)],
  ['GET', re('users/me')],
  ['PATCH', re('users/me/profile')],
];

// These routes are useful only to an authenticated staff member working from
// the loopback pilot origin. Nest remains authoritative for JWT, CSRF and role
// checks. The HTTPS gateway never selects this allowlist.
const localStaffApiRules = [
  ['GET', re('admin/(?:stats|courses/stats|users(?:\\?.*)?|users/online|users/' + ID + '/(?:progress|certificates))')],
  ['POST', re('admin/users/' + ID + '/(?:reset-password|grant-certificate/' + ID + '|grant-exam-access/' + ID + ')')],
  ['POST', re('admin/certificates/' + ID + '/revoke')],
  ['PATCH', re('users/' + ID + '/role')],
  ['POST', re('courses')],
  ['GET', re('courses/manage(?:\\?.*)?')],
  ['PATCH', re('courses/' + ID)],
  ['DELETE', re('courses/' + ID)],
  ['POST', re('courses/' + ID + '/(?:publish|archive|modules|exams)')],
  ['GET', re('courses/' + ID + '/exams(?:/' + ID + ')?')],
  ['PATCH', re('courses/' + ID + '/exams/' + ID)],
  ['DELETE', re('courses/' + ID + '/exams/' + ID)],
  ['POST', re('courses/' + ID + '/exams/' + ID + '/questions')],
  ['PATCH', re('courses/' + ID + '/exams/' + ID + '/questions/' + ID)],
  ['DELETE', re('courses/' + ID + '/exams/' + ID + '/questions/' + ID)],
  ['PATCH', re('modules/(?:reorder|' + ID + ')')],
  ['DELETE', re('modules/' + ID)],
  ['POST', re('modules/' + ID + '/lessons')],
  ['POST', re('courses/' + ID + '/lessons')],
  ['PATCH', re('lessons/' + ID)],
  ['DELETE', re('lessons/' + ID)],
  ['POST', re('lessons/' + ID + '/steps')],
  ['PATCH', re('steps/' + ID)],
  ['DELETE', re('steps/' + ID)],
  ['GET', re('proctor/sessions/' + ID)],
  ['POST', re('proctor/sessions/' + ID + '/(?:review|appeal/resolve)')],
  ['GET', re('proctor/exams/' + ID + '/(?:assignments|candidates)')],
  ['PUT', re('proctor/exams/' + ID + '/assignments/' + ID)],
  ['DELETE', re('proctor/exams/' + ID + '/assignments/' + ID)],
  ['PATCH', re('attempts/' + ID + '/flag')],
  ['GET', re('evidence/' + ID)],
  ['POST', re('evidence/' + ID + '/hold')],
  ['GET', re('pilot/overview')],
  ['GET', re('pilot/members/' + ID + '/progress')],
  ['POST', re('pilot/invitations')],
  ['POST', re('pilot/invitations/' + ID + '/revoke')],
  ['POST', re('pilot/members/' + ID + '/(?:suspend|resume)')],
  ['POST', re('pilot/members/' + ID + '/courses/' + ID + '/withdraw')],
  ['POST', re('content-import/draft')],
];

function safeTarget(raw) {
  // A downstream framework may decode a path before applying its own route
  // policy. Reject encoded path bytes here so the allowlist is evaluated on
  // the same representation Next/Nest will ultimately route.
  const rawPath = typeof raw === 'string' ? raw.split('?', 1)[0] : '';
  if (typeof raw !== 'string' || raw.length > 4096 || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || rawPath.includes('%')) return null;
  let decoded;
  try { decoded = decodeURIComponent(raw.split('?', 1)[0]); } catch { return null; }
  if (decoded.split('/').some((part) => part === '.' || part === '..') || /[\0\r\n]/.test(decoded)) return null;
  return raw;
}

function frontendPath(method, pathname, { localStaff = false } = {}) {
  if (!['GET', 'HEAD'].includes(method) || pathname.endsWith('.map')) return false;
  if (/^\/(?:_next\/static\/|fonts\/|demo\/)/.test(pathname)) return true;
  if (/^\/(?:favicon\.ico|robots\.txt)$/.test(pathname)) return true;
  if (/^\/api\/public\/certificates\/verify\//.test(pathname)) return true;
  if (/^\/dashboard\/(?:admin|teacher|proctor)(?:\/|$)/.test(pathname)) return localStaff;
  return /^\/(?:$|courses(?:\/[^/]+)?|auth\/(?:login|register)|dashboard(?:\/.*)?|verify\/[0-9a-f-]+)$/.test(pathname);
}

function routeRequest(method, rawTarget, { localStaff = false } = {}) {
  const target = safeTarget(rawTarget);
  if (!target) return { status: 400 };
  const parsed = new URL(target, 'http://pilot.invalid');
  const pathname = parsed.pathname;
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return { status: 405 };
  if (pathname === '/socket.io/' || pathname === '/socket.io') return method === 'GET' ? { upstream: 'api', path: `${pathname}${parsed.search}`, socket: true, limit: 0 } : { status: 405 };
  if (frontendPath(method, pathname, { localStaff })) return { upstream: 'web', path: target, limit: 0 };
  if (!pathname.startsWith('/api/')) return { status: 404 };
  const apiPath = `${pathname.slice(5)}${parsed.search}`;
  if (localStaff && localStaffApiRules.some(([verb, pattern]) => verb === method && pattern.test(apiPath))) {
    return { upstream: 'api', path: `/${apiPath}`, limit: 2 * 1024 * 1024, localStaff: true };
  }
  if (/^(?:admin|pilot|content-import|courses\/manage)(?:\/|\?|$)/i.test(apiPath)) return { status: 404 };
  if (apiRules.some(([verb, pattern]) => verb === method && pattern.test(apiPath))) {
    const upload = method === 'PUT' && /^evidence\/uploads\//.test(apiPath);
    return { upstream: 'api', path: `/${apiPath}`, limit: upload ? 9 * 1024 * 1024 : 2 * 1024 * 1024 };
  }
  return { status: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? 404 : 405 };
}

function providerAccepted(req, publicMode, gatewaySecret) {
  if (!publicMode || req.headers['x-proctolearn-gateway'] !== gatewaySecret) return false;
  const trusted = String(req.headers['x-proctolearn-client-ip'] || '').trim();
  return !trusted.includes(',') && Boolean(isIP(trusted));
}

function clientAddress(req, gatewayAccepted) {
  if (gatewayAccepted) {
    // This value must be overwritten at the provider edge from its trusted
    // connection metadata. Visitor supplied X-Forwarded-For is never used.
    const trusted = String(req.headers['x-proctolearn-client-ip'] || '').trim();
    if (!trusted.includes(',') && isIP(trusted)) return trusted;
  }
  return req.socket.remoteAddress === '::1' ? '127.0.0.1' : (req.socket.remoteAddress || '127.0.0.1');
}

const REQUEST_HEADERS = new Set(['accept', 'accept-encoding', 'accept-language', 'content-type', 'content-length', 'cookie', 'origin', 'referer', 'range', 'if-none-match', 'if-modified-since', 'user-agent', 'x-csrf-token', 'x-session-user',
  'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions', 'sec-websocket-protocol']);
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

function upstreamHeaders(req, options, gatewayAccepted) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) if (REQUEST_HEADERS.has(name) || name.startsWith('sec-fetch-') || name.startsWith('sec-ch-ua')) headers[name] = value;
  if (options.allowNextHeaders) {
    if (req.headers.rsc === '1') headers.rsc = '1';
    if (req.headers['next-router-prefetch'] === '1') headers['next-router-prefetch'] = '1';
    const segment = req.headers['next-router-segment-prefetch'];
    if (typeof segment === 'string' && segment.length <= 256) headers['next-router-segment-prefetch'] = segment;
    const tree = req.headers['next-router-state-tree'];
    if (typeof tree === 'string' && tree.length <= 8192) headers['next-router-state-tree'] = tree;
    const nextUrl = req.headers['next-url'];
    if (typeof nextUrl === 'string' && nextUrl.length <= 2048 && safeTarget(nextUrl)) {
      const parsedNext = new URL(nextUrl, 'http://pilot.invalid');
      if (frontendPath('GET', parsedNext.pathname, { localStaff: options.localStaff })) headers['next-url'] = nextUrl;
    }
  }
  headers.host = options.upstreamHost;
  headers['x-forwarded-for'] = clientAddress(req, gatewayAccepted);
  headers['x-forwarded-host'] = options.publicOrigin.host;
  headers['x-forwarded-proto'] = options.publicOrigin.protocol.slice(0, -1);
  return headers;
}

function writeFailure(response, status) {
  if (response.headersSent) return response.destroy();
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify({ statusCode: status, message: status === 413 ? 'Сұрау тым үлкен' : status === 503 ? 'Қызмет уақытша қолжетімсіз' : 'Рұқсат жоқ' }));
}

function createPilotProxy({ publicOrigin = 'http://127.0.0.1:3200', gatewaySecret = '', requestTimeoutMs = 120_000, maxActive = 64 } = {}) {
  const origin = new URL(publicOrigin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Pilot public origin must be one exact HTTP(S) origin.');
  const publicMode = origin.protocol === 'https:';
  if (publicMode && !/^[A-Za-z0-9_-]{43,128}$/.test(gatewaySecret)) throw new Error('Public pilot proxy requires a private gateway header secret.');
  let active = 0;
  const server = http.createServer((req, res) => {
    const accepted = providerAccepted(req, publicMode, gatewaySecret);
    if (publicMode && !accepted) return writeFailure(res, 404);
    const route = routeRequest(req.method || 'GET', req.url || '', { localStaff: !publicMode });
    if (route.status) return writeFailure(res, route.status);
    if (active >= maxActive) return writeFailure(res, 503);
    const destination = route.upstream === 'api' ? API_ORIGIN : WEB_ORIGIN;
    const length = Number(req.headers['content-length'] || 0);
    if (route.limit && (!Number.isFinite(length) || length > route.limit)) return writeFailure(res, 413);
    active += 1;
    let bytes = 0;
    const limiter = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > route.limit && route.limit) {
        const error = new Error('REQUEST_LIMIT'); error.code = 'REQUEST_LIMIT'; callback(error); return;
      }
      callback(null, chunk);
    } });
    const upstream = http.request({ hostname: destination.hostname, port: destination.port, method: req.method, path: route.path,
      headers: upstreamHeaders(req, { publicOrigin: origin, upstreamHost: `${destination.hostname}:${destination.port}`, allowNextHeaders: route.upstream === 'web', localStaff: !publicMode }, accepted), timeout: requestTimeoutMs }, (answer) => {
      const headers = {};
      for (const [name, value] of Object.entries(answer.headers)) if (!HOP_HEADERS.has(name) && !['server', 'x-powered-by'].includes(name)) headers[name] = value;
      headers['x-content-type-options'] = 'nosniff';
      headers['referrer-policy'] = 'same-origin';
      headers['permissions-policy'] = 'camera=(self), microphone=(self), display-capture=(self), geolocation=()';
      if (publicMode) headers['strict-transport-security'] = 'max-age=31536000';
      res.writeHead(answer.statusCode || 502, headers);
      answer.pipe(res);
    });
    const finish = () => { active = Math.max(0, active - 1); };
    let failed = false;
    const fail = (status) => { if (!failed) { failed = true; writeFailure(res, status); } };
    upstream.once('close', finish);
    upstream.once('timeout', () => upstream.destroy(new Error('UPSTREAM_TIMEOUT')));
    upstream.once('error', (error) => fail(error.code === 'REQUEST_LIMIT' ? 413 : 503));
    req.once('aborted', () => upstream.destroy());
    limiter.once('error', (error) => {
      req.unpipe(limiter); limiter.unpipe(upstream); req.resume();
      fail(error.code === 'REQUEST_LIMIT' ? 413 : 503);
      upstream.destroy(error);
    });
    req.pipe(limiter).pipe(upstream);
  });

  server.on('upgrade', (req, socket, head) => {
    const accepted = providerAccepted(req, publicMode, gatewaySecret);
    const route = (!publicMode || accepted) ? routeRequest('GET', req.url || '', { localStaff: !publicMode }) : { status: 404 };
    if (route.status || !route.socket || active >= maxActive) return socket.destroy();
    active += 1;
    const upstream = http.request({ hostname: API_ORIGIN.hostname, port: API_ORIGIN.port, method: 'GET', path: route.path,
      headers: { ...upstreamHeaders(req, { publicOrigin: origin, upstreamHost: `${API_ORIGIN.hostname}:${API_ORIGIN.port}`, allowNextHeaders: false, localStaff: false }, accepted), connection: 'Upgrade', upgrade: 'websocket' },
      timeout: Math.min(requestTimeoutMs, 15_000) });
    let released = false;
    let upgraded = false;
    let bridgedSocket;
    const finish = () => { if (!released) { released = true; active = Math.max(0, active - 1); } };
    upstream.on('upgrade', (answer, upstreamSocket, upstreamHead) => {
      upgraded = true;
      bridgedSocket = upstreamSocket;
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(answer.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`);
      if (head.length) upstreamSocket.write(head);
      if (upstreamHead.length) socket.write(upstreamHead);
      socket.pipe(upstreamSocket).pipe(socket);
      upstreamSocket.once('close', finish);
      upstreamSocket.once('error', () => { finish(); socket.destroy(); });
    });
    upstream.once('response', (answer) => { answer.resume(); finish(); socket.destroy(); });
    upstream.once('timeout', () => { finish(); upstream.destroy(new Error('UPSTREAM_TIMEOUT')); socket.destroy(); });
    upstream.once('error', () => { finish(); socket.destroy(); });
    socket.once('close', () => { finish(); if (bridgedSocket) bridgedSocket.destroy(); else if (!upgraded) upstream.destroy(); });
    socket.once('error', () => { finish(); if (bridgedSocket) bridgedSocket.destroy(); upstream.destroy(); });
    upstream.end();
  });
  server.maxConnections = 80;
  server.headersTimeout = 15_000;
  server.requestTimeout = requestTimeoutMs + 5_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

module.exports = { API_ORIGIN, WEB_ORIGIN, safeTarget, frontendPath, routeRequest, providerAccepted, clientAddress, upstreamHeaders, createPilotProxy };
