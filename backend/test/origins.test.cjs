const { test } = require('node:test');
const assert = require('node:assert/strict');
const { configuredOrigins, isAllowedOrigin } = require('../src/common/config/origins');
const { validateEnvironment } = require('../src/common/config/environment');

test('production startup requires explicit HTTPS origins and independent keys', () => {
  const env = { NODE_ENV: 'production', JWT_ACCESS_SECRET: 'a'.repeat(64), JWT_REFRESH_SECRET: 'b'.repeat(64), CERTIFICATE_PUBLIC_ORIGIN: 'https://verify.example.com' };
  for (const origin of [undefined, '', 'http://localhost:3000', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?query=1', 'https://example.com#fragment', 'https://example.com,']) {
    assert.throws(() => validateEnvironment({ ...env, FRONTEND_URL: origin }), /FRONTEND_URL/);
  }
  assert.equal(validateEnvironment({ ...env, FRONTEND_URL: 'https://app.example.com' }).FRONTEND_URL, 'https://app.example.com');
  assert.throws(() => validateEnvironment({ ...env, FRONTEND_URL: 'https://app.example.com', JWT_REFRESH_SECRET: env.JWT_ACCESS_SECRET }), /different/);
});

test('credentialed origins reject missing/null, suffix attacks and unrelated localhost', () => {
  const allowed = configuredOrigins('https://app.example.com, https://staff.example.com/', true);
  assert.equal(isAllowedOrigin('https://app.example.com', allowed), true);
  assert.equal(isAllowedOrigin('https://staff.example.com', allowed), true);
  for (const origin of [undefined, 'null', 'http://localhost:3000', 'https://app.example.com.evil.test', 'http://app.example.com', 'https://app.example.com:444', 'https://app.example.com/']) {
    assert.equal(isAllowedOrigin(origin, allowed), false);
  }
});

test('trusted proxies require explicit IP/CIDR configuration and reject blanket/hop-count trust', () => {
  const { configuredTrustedProxies } = require('../src/common/config/trusted-proxies');
  assert.equal(configuredTrustedProxies(undefined), false);
  assert.equal(configuredTrustedProxies(''), false);
  assert.deepEqual(configuredTrustedProxies('127.0.0.1, ::1, 10.1.2.0/24'), ['127.0.0.1', '::1', '10.1.2.0/24']);
  for (const input of [true, 1, 'true', '1', 'loopback', '*', '0.0.0.0/0', '::/0', '127.0.0.1,', '10.0.0.1/33', '::1/129', '10.0.0.1/24/2']) {
    assert.throws(() => configuredTrustedProxies(input), /TRUSTED_PROXIES/);
  }
});

test('Express client IP separates proxied clients and ignores forged forwarding chains from untrusted sources', () => {
  const express = require('express');
  const { configuredTrustedProxies } = require('../src/common/config/trusted-proxies');
  const app = express();
  const requestIp = (remoteAddress, forwarded) => {
    const request = Object.create(app.request);
    request.app = app;
    request.connection = { remoteAddress };
    request.headers = { 'x-forwarded-for': forwarded };
    return request.ip;
  };
  app.set('trust proxy', configuredTrustedProxies(undefined));
  assert.equal(requestIp('127.0.0.1', '203.0.113.1'), '127.0.0.1');
  app.set('trust proxy', configuredTrustedProxies('127.0.0.1,::1'));
  assert.equal(requestIp('127.0.0.1', '203.0.113.1'), '203.0.113.1');
  assert.equal(requestIp('::1', '203.0.113.2'), '203.0.113.2');
  assert.equal(requestIp('127.0.0.1', '192.0.2.99, 203.0.113.1'), '203.0.113.1');
  assert.equal(requestIp('203.0.113.1', '192.0.2.99'), '203.0.113.1');
});
