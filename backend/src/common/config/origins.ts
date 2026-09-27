import type { ConfigService } from '@nestjs/config';

/** One exact allowlist for credentialed HTTP, WebSocket handshakes and mail links. */
export function configuredOrigins(raw?: string, production = false): string[] {
  const configured = raw?.trim();
  if (!configured && production) throw new Error('FRONTEND_URL must contain an HTTPS frontend origin in production');
  const values = (configured || 'http://localhost:3000,http://localhost:3001').split(',');
  const origins = values.map((value) => {
    const input = value.trim();
    let url: URL;
    try { url = new URL(input); } catch { throw new Error('FRONTEND_URL must contain valid origins'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || (production && url.protocol !== 'https:')) {
      throw new Error('FRONTEND_URL must contain exact origins without credentials, paths or queries; production requires HTTPS');
    }
    return url.origin;
  });
  return [...new Set(origins)];
}

export function isAllowedOrigin(origin: string | undefined, allowed: readonly string[]): boolean {
  return typeof origin === 'string' && allowed.includes(origin);
}

export function getFrontendOrigins(config: Pick<ConfigService, 'get'>): string[] {
  return configuredOrigins(config.get<string>('FRONTEND_URL'), config.get<string>('NODE_ENV') === 'production');
}
