function demoSeedPassword(key, env = process.env) {
  if (env.NODE_ENV === 'production' || env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Demo seed is disabled. Use a disposable demo database and set ALLOW_DEMO_SEED=true outside production.');
  }
  const value = env[key];
  if (typeof value !== 'string' || value.length < 16 || /change[_-]?me|your[_-]|example/i.test(value)) {
    throw new Error(`${key} must be a private demo password of at least 16 characters`);
  }
  return value;
}
function demoSeedMode(env = process.env) {
  const mode = env.DEMO_SEED_MODE || 'full';
  if (!['full', 'minimal'].includes(mode)) throw new Error('DEMO_SEED_MODE must be full or minimal');
  return mode;
}
module.exports = { demoSeedPassword, demoSeedMode };
