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
module.exports = { demoSeedPassword };
