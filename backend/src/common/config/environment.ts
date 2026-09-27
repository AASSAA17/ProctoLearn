import { configuredOrigins } from './origins';

/** Fail closed instead of silently signing tokens with a public default key. */
export function validateEnvironment(env: Record<string, unknown>) {
  const keys = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;
  for (const key of keys) {
    const value = env[key];
    if (typeof value !== 'string' || value.trim().length < 32 || /your_|change[_-]?me|access_secret|refresh_secret/i.test(value)) {
      throw new Error(`${key} must be a unique random secret of at least 32 characters`);
    }
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error('Access and refresh signing keys must be different');
  }
  configuredOrigins(typeof env.FRONTEND_URL === 'string' ? env.FRONTEND_URL : undefined, env.NODE_ENV === 'production');
  return env;
}
