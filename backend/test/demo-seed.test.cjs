const { test } = require('node:test');
const assert = require('node:assert/strict');
const { demoSeedPassword } = require('../prisma/demo-seed.cjs');

test('demo seeding needs opt-in and never accepts production', () => {
  assert.throws(() => demoSeedPassword('DEMO_ADMIN_PASSWORD', {}), /disabled/);
  assert.throws(() => demoSeedPassword('DEMO_ADMIN_PASSWORD', { ALLOW_DEMO_SEED: 'true', NODE_ENV: 'production' }), /disabled/);
});
test('demo seed rejects missing, weak and template passwords without logging values', () => {
  for (const value of [undefined, '', 'short', 'change-me-before-using']) {
    assert.throws(() => demoSeedPassword('DEMO_ADMIN_PASSWORD', { ALLOW_DEMO_SEED: 'true', DEMO_ADMIN_PASSWORD: value }), /DEMO_ADMIN_PASSWORD must/);
  }
});
test('demo seed uses the supplied private password', () => {
  const value = require('node:crypto').randomBytes(24).toString('hex');
  assert.equal(demoSeedPassword('DEMO_ADMIN_PASSWORD', { ALLOW_DEMO_SEED: 'true', DEMO_ADMIN_PASSWORD: value }), value);
});
