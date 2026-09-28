const { test } = require('node:test');
const assert = require('node:assert/strict');
const { demoSeedPassword, demoSeedMode } = require('../prisma/demo-seed.cjs');

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
test('demo seed selects an explicit minimal fixture without changing the full default', () => {
  assert.equal(demoSeedMode({}), 'full');
  assert.equal(demoSeedMode({ DEMO_SEED_MODE: 'minimal' }), 'minimal');
  assert.throws(() => demoSeedMode({ DEMO_SEED_MODE: 'production' }), /full or minimal/);
});
