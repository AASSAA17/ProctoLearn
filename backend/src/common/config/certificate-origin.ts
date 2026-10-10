/** A single trusted origin; never derive printed QR links from request headers or CORS order. */
export function certificateOrigin(raw = process.env.CERTIFICATE_PUBLIC_ORIGIN, production = process.env.NODE_ENV === 'production') {
  if (!raw && !production) return 'http://localhost:3000';
  if (!raw || raw.includes(',')) throw new Error('CERTIFICATE_PUBLIC_ORIGIN must be one trusted origin');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('CERTIFICATE_PUBLIC_ORIGIN is invalid'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:') ||
      (!production && url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('CERTIFICATE_PUBLIC_ORIGIN requires HTTPS (localhost HTTP is allowed in development)');
  }
  return url.origin;
}
