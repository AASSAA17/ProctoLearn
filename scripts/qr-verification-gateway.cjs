'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const FIXED_NEXT_ORIGIN = 'http://127.0.0.1:3000';
const DEFAULT_NEXT_DIR = path.join(__dirname, '../frontend/.next');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATIC_PREFIX = '/_next/static/';
const STATIC_EXTENSION = /\.(?:js|css|woff2)$/i;
const CSP = "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; upgrade-insecure-requests";
const MAX_DISCOVERY_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_ACTIVE_UPSTREAMS = 16;

function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

function securityHeaders() {
  return {
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    'Content-Security-Policy': CSP,
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  };
}

function normalizeAssets(assets) {
  if (!(assets instanceof Set) && !Array.isArray(assets)) {
    throw new TypeError('assets must be a Set or array of exact Next.js asset paths');
  }
  const result = new Set();
  for (const asset of assets) {
    if (typeof asset !== 'string' || !asset.startsWith(STATIC_PREFIX)
      || !STATIC_EXTENSION.test(asset) || asset.includes('%') || asset.includes('\\')
      || asset.includes('?') || asset.includes('#') || asset.split('/').includes('..')) {
      throw new Error(`Invalid verification asset path: ${String(asset)}`);
    }
    result.add(asset);
  }
  return result;
}

function normalizeCertificateCodes(certificateCodes) {
  if (!(certificateCodes instanceof Set)) {
    throw new TypeError('certificateCodes must be a Set of fictional certificate UUIDs');
  }
  const result = new Set();
  for (const code of certificateCodes) {
    if (!isUuid(code)) throw new Error(`Invalid published certificate UUID: ${String(code)}`);
    result.add(code.toLowerCase());
  }
  return result;
}

function evaluateRequest(request, assets) {
  const method = String(request.method || '').toUpperCase();
  const headers = request.headers || {};
  const rawUrl = request.url;
  if (headers.upgrade || /(?:^|,)\s*upgrade\s*(?:,|$)/i.test(String(headers.connection || ''))) {
    return { allowed: false, status: 404, reason: 'upgrade' };
  }
  if (headers.rsc !== undefined || headers['next-router-state-tree'] !== undefined
    || headers['next-router-prefetch'] !== undefined || headers['next-url'] !== undefined) {
    return { allowed: false, status: 404, reason: 'next-internal-request' };
  }
  if (method !== 'GET' && method !== 'HEAD') {
    return { allowed: false, status: 405, reason: 'method' };
  }
  if (headers['transfer-encoding'] || (headers['content-length'] !== undefined
    && String(headers['content-length']).trim() !== '0')) {
    return { allowed: false, status: 400, reason: 'request-body' };
  }
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2048
    || !rawUrl.startsWith('/') || rawUrl.startsWith('//') || rawUrl.includes('?')
    || rawUrl.includes('#') || rawUrl.includes('%') || rawUrl.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(rawUrl)
    || rawUrl.split('/').some((segment) => segment === '.' || segment === '..')) {
    return { allowed: false, status: 400, reason: 'malformed-path' };
  }

  // Browsers request this implicitly even without an icon link. Serve no content
  // locally; never widen upstream asset access for this cosmetic request.
  if (rawUrl === '/favicon.ico') return { allowed: true, kind: 'empty-icon', method };
  const page = rawUrl.match(/^\/verify\/([^/]+)$/);
  if (page) {
    return isUuid(page[1])
      ? { allowed: true, kind: 'page', upstreamPath: rawUrl, method }
      : { allowed: false, status: 400, reason: 'identifier' };
  }
  const api = rawUrl.match(/^\/api\/public\/certificates\/verify\/([^/]+)$/);
  if (api) {
    return isUuid(api[1])
      ? { allowed: true, kind: 'api', upstreamPath: rawUrl, method }
      : { allowed: false, status: 400, reason: 'identifier' };
  }
  if (rawUrl.startsWith(STATIC_PREFIX)) {
    return assets.has(rawUrl)
      ? { allowed: true, kind: 'asset', upstreamPath: rawUrl, method }
      : { allowed: false, status: 404, reason: 'asset-not-allowlisted' };
  }
  return { allowed: false, status: 404, reason: 'route-not-allowlisted' };
}

function fixedRequestHeaders(kind) {
  return {
    Accept: kind === 'page' ? 'text/html,application/xhtml+xml'
      : kind === 'api' ? 'application/json' : '*/*',
    'Accept-Encoding': 'identity',
    'User-Agent': 'ProctoLearn-QR-Verification-Gateway/1',
  };
}

function requestFixedUpstream(url, options) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method: options.method,
      headers: options.headers,
      agent: false,
    });
    const abort = () => request.destroy(new Error('client disconnected'));
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    };
    request.once('error', (error) => { cleanup(); reject(error); });
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => request.destroy(new Error('upstream timeout')), options.timeoutMs);
    request.once('response', (response) => {
      const chunks = [];
      let bytes = 0;
      const declared = Number(response.headers['content-length']);
      if (Number.isFinite(declared) && declared > options.maxBytes) {
        response.destroy();
        cleanup();
        reject(new Error('upstream response too large'));
        return;
      }
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > options.maxBytes) {
          response.destroy(new Error('upstream response too large'));
          return;
        }
        chunks.push(chunk);
      });
      response.once('error', (error) => { cleanup(); reject(error); });
      response.once('end', () => {
        cleanup();
        resolve({ statusCode: response.statusCode || 502, headers: response.headers, body: Buffer.concat(chunks) });
      });
    });
    request.end();
  });
}

function expectedContentType(kind, upstreamPath) {
  if (kind === 'page') return 'text/html; charset=utf-8';
  if (kind === 'api') return 'application/json; charset=utf-8';
  if (upstreamPath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (upstreamPath.endsWith('.woff2')) return 'font/woff2';
  return 'application/javascript; charset=utf-8';
}

function compatibleContentType(kind, upstreamPath, value) {
  const type = String(value || '').toLowerCase();
  if (kind === 'page') return type.startsWith('text/html');
  if (kind === 'api') return type.startsWith('application/json');
  if (upstreamPath.endsWith('.css')) return type.startsWith('text/css');
  if (upstreamPath.endsWith('.woff2')) return type.startsWith('font/woff2') || type.startsWith('application/font-woff');
  return type.includes('javascript');
}

function send(response, status, body, contentType, method = 'GET', extraHeaders = {}) {
  if (response.destroyed) return;
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  response.writeHead(status, {
    ...securityHeaders(),
    'Content-Type': contentType,
    'Content-Length': bytes.length,
    ...extraHeaders,
  });
  response.end(method === 'HEAD' ? undefined : bytes);
}

function createGateway({ assets, certificateCodes, requestTimeoutMs = 5_000, maxResponseBytes = MAX_RESPONSE_BYTES,
  _requestUpstream = requestFixedUpstream } = {}) {
  const allowedAssets = normalizeAssets(assets);
  const publishedCertificateCodes = normalizeCertificateCodes(certificateCodes);
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 100 || requestTimeoutMs > 30_000) {
    throw new RangeError('requestTimeoutMs must be between 100 and 30000');
  }
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1024 || maxResponseBytes > 16 * 1024 * 1024) {
    throw new RangeError('maxResponseBytes must be between 1024 and 16777216');
  }
  if (typeof _requestUpstream !== 'function') throw new TypeError('_requestUpstream must be a function');

  let activeUpstreams = 0;
  const server = http.createServer(async (request, response) => {
    const decision = evaluateRequest(request, allowedAssets);
    if (!decision.allowed) {
      const extra = decision.status === 405 ? { Allow: 'GET, HEAD' } : {};
      send(response, decision.status, decision.status === 400 ? 'Bad request\n' : 'Not found\n',
        'text/plain; charset=utf-8', request.method, extra);
      return;
    }
    if (decision.kind === 'empty-icon') {
      send(response, 204, '', 'image/x-icon', decision.method);
      return;
    }
    if (decision.kind === 'api') {
      const code = decision.upstreamPath.slice(decision.upstreamPath.lastIndexOf('/') + 1).toLowerCase();
      if (!publishedCertificateCodes.has(code)) {
        send(response, 200, JSON.stringify({ valid: false }), 'application/json; charset=utf-8', decision.method);
        return;
      }
    }
    if (activeUpstreams >= MAX_ACTIVE_UPSTREAMS) {
      const body = decision.kind === 'api'
        ? JSON.stringify({ error: 'Verification service unavailable' })
        : 'Verification service unavailable\n';
      send(response, 503, body, decision.kind === 'api' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', decision.method);
      return;
    }
    const upstreamUrl = new URL(decision.upstreamPath, FIXED_NEXT_ORIGIN);
    const abortController = new AbortController();
    const abortUpstream = () => abortController.abort();
    request.once('aborted', abortUpstream);
    response.once('close', abortUpstream);
    activeUpstreams += 1;
    try {
      const upstream = await _requestUpstream(upstreamUrl, {
        method: decision.method,
        headers: fixedRequestHeaders(decision.kind),
        timeoutMs: requestTimeoutMs,
        maxBytes: maxResponseBytes,
        signal: abortController.signal,
      });
      if (upstream.statusCode >= 300 && upstream.statusCode < 400) {
        send(response, 502, 'Verification gateway error\n', 'text/plain; charset=utf-8', decision.method);
        return;
      }
      if (upstream.statusCode >= 500) {
        const body = decision.kind === 'api'
          ? JSON.stringify({ error: 'Verification service unavailable' })
          : 'Verification service unavailable\n';
        send(response, 503, body, decision.kind === 'api' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', decision.method);
        return;
      }
      if (!compatibleContentType(decision.kind, decision.upstreamPath, upstream.headers?.['content-type'])) {
        send(response, 502, 'Verification gateway error\n', 'text/plain; charset=utf-8', decision.method);
        return;
      }
      send(response, upstream.statusCode, upstream.body || Buffer.alloc(0),
        expectedContentType(decision.kind, decision.upstreamPath), decision.method);
    } catch {
      const body = decision.kind === 'api'
        ? JSON.stringify({ error: 'Verification service unavailable' })
        : 'Verification service unavailable\n';
      send(response, 503, body, decision.kind === 'api' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', decision.method);
    } finally {
      activeUpstreams -= 1;
      request.off('aborted', abortUpstream);
      response.off('close', abortUpstream);
    }
  });
  server.maxConnections = 64;
  server.maxHeadersCount = 32;
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  server.on('upgrade', (_request, socket) => socket.destroy());
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  return server;
}

function assetFile(nextDir, asset) {
  const staticRoot = path.resolve(nextDir, 'static');
  const candidate = path.resolve(nextDir, asset.slice('/_next/'.length).split('/').join(path.sep));
  if (candidate !== staticRoot && !candidate.startsWith(`${staticRoot}${path.sep}`)) {
    throw new Error('Asset escaped the Next.js static directory');
  }
  if (!fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Verification asset is missing from the current build: ${asset}`);
  }
  return candidate;
}

function addAsset(result, nextDir, candidate) {
  let asset = candidate.replaceAll('\\/', '/').replaceAll('\\', '/');
  if (asset.startsWith('static/')) asset = `/_next/${asset}`;
  if (!asset.startsWith(STATIC_PREFIX) || !STATIC_EXTENSION.test(asset)
    || asset.includes('%') || asset.includes('?') || asset.includes('#')
    || asset.split('/').some((segment) => segment === '.' || segment === '..')) return false;
  assetFile(nextDir, asset);
  result.add(asset);
  return true;
}

function extractAssets(text) {
  const matches = new Set();
  const absolute = /\/_next\/static\/[A-Za-z0-9._/-]+\.(?:js|css|woff2)/gi;
  const relative = /(?:^|["'`(,:\s])((?:static\/)(?:chunks|media)\/[A-Za-z0-9._/-]+\.(?:js|css|woff2))/gi;
  for (const match of text.matchAll(absolute)) matches.add(match[0]);
  for (const match of text.matchAll(relative)) matches.add(match[1]);
  return matches;
}

function addBuildManifestAssets(result, nextDir) {
  const clientManifest = path.join(nextDir, 'server/app/verify/[code]/page_client-reference-manifest.js');
  const fontManifest = path.join(nextDir, 'server/next-font-manifest.json');
  if (!fs.statSync(clientManifest, { throwIfNoEntry: false })?.isFile()) {
    throw new Error('The current Next.js build has no verification page client manifest');
  }
  for (const asset of extractAssets(fs.readFileSync(clientManifest, 'utf8'))) addAsset(result, nextDir, asset);
  const fonts = JSON.parse(fs.readFileSync(fontManifest, 'utf8'));
  const routeFonts = fonts.app?.['[project]/src/app/verify/[code]/page'];
  if (!Array.isArray(routeFonts)) throw new Error('The verification page font manifest is missing');
  for (const asset of routeFonts) addAsset(result, nextDir, asset);
}

function addReferencedAssets(result, nextDir) {
  const queue = [...result];
  const visited = new Set();
  while (queue.length) {
    const asset = queue.shift();
    if (visited.has(asset)) continue;
    visited.add(asset);
    if (!asset.endsWith('.js') && !asset.endsWith('.css')) continue;
    const contents = fs.readFileSync(assetFile(nextDir, asset), 'utf8');
    for (const reference of extractAssets(contents)) {
      const before = result.size;
      addAsset(result, nextDir, reference);
      if (result.size !== before) queue.push([...result].at(-1));
    }
    if (asset.endsWith('.css')) {
      for (const match of contents.matchAll(/url\(["']?(\.\.\/media\/[A-Za-z0-9._-]+\.woff2)["']?\)/gi)) {
        const referenced = `/_next/static/media/${path.posix.basename(match[1])}`;
        const before = result.size;
        addAsset(result, nextDir, referenced);
        if (result.size !== before) queue.push(referenced);
      }
    }
  }
}

async function discoverAssets({ code, nextDir = DEFAULT_NEXT_DIR, requestTimeoutMs = 5_000,
  _requestUpstream = requestFixedUpstream } = {}) {
  if (!isUuid(code)) throw new Error('A valid certificate UUID is required for asset discovery');
  const resolvedNextDir = path.resolve(nextDir);
  const upstreamUrl = new URL(`/verify/${code}`, FIXED_NEXT_ORIGIN);
  const response = await _requestUpstream(upstreamUrl, {
    method: 'GET', headers: fixedRequestHeaders('page'), timeoutMs: requestTimeoutMs, maxBytes: MAX_DISCOVERY_BYTES,
  });
  if (response.statusCode < 200 || response.statusCode >= 300
    || !String(response.headers?.['content-type'] || '').toLowerCase().startsWith('text/html')) {
    throw new Error('The local verification page did not return HTML without a redirect');
  }
  const result = new Set();
  for (const asset of extractAssets(Buffer.from(response.body).toString('utf8'))) addAsset(result, resolvedNextDir, asset);
  addBuildManifestAssets(result, resolvedNextDir);
  addReferencedAssets(result, resolvedNextDir);
  if (result.size === 0) throw new Error('No verification page assets were discovered');
  return result;
}

module.exports = {
  FIXED_NEXT_ORIGIN,
  createGateway,
  discoverAssets,
  evaluateRequest,
  isUuid,
  securityHeaders,
};
