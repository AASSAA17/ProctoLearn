const { test } = require('node:test');
const assert = require('node:assert/strict');
const { configuredOrigins, isAllowedOrigin } = require('../src/common/config/origins');
const { validateEnvironment } = require('../src/common/config/environment');

test('production startup requires explicit HTTPS origins and independent keys', () => {
  const env = { NODE_ENV: 'production', JWT_ACCESS_SECRET: 'a'.repeat(64), JWT_REFRESH_SECRET: 'b'.repeat(64) };
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
