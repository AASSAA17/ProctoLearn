export function certificateVerificationUrl(origin: string, code: string): string {
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid website origin');
  return `${base.origin}/verify/${encodeURIComponent(code)}`;
}

/** Inbox entries can link only to an internal application route. */
export function notificationTarget(value: string | null | undefined): string | null {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const base = 'https://application.invalid';
    const url = new URL(value, base);
    if (url.origin !== base) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}
