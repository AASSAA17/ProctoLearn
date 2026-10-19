export type LearningMedia =
  | { kind: 'direct'; url: string }
  | { kind: 'embed'; url: string }
  | { kind: 'link'; url: string }
  | { kind: 'invalid'; url: '' };

const DIRECT_MEDIA_EXTENSIONS = /\.(?:mp4|webm|ogg)$/i;

function parsedHttpOrSiteUrl(value: string): URL | null {
  const source = value.trim();
  if (!source || (!source.startsWith('/') && !/^https?:\/\//i.test(source))) return null;
  try {
    const parsed = new URL(source, 'https://proctolearn.invalid');
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isAllowedLearningEmbed(value: string): boolean {
  const parsed = parsedHttpOrSiteUrl(value);
  if (!parsed || parsed.origin === 'https://proctolearn.invalid') return false;
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  return (
    ((host === 'www.youtube.com' || host === 'youtube.com' || host === 'www.youtube-nocookie.com' || host === 'youtube-nocookie.com') && path.startsWith('/embed/'))
    || (host === 'player.vimeo.com' && path.startsWith('/video/'))
  );
}

export function classifyLearningMedia(value: unknown): LearningMedia {
  if (typeof value !== 'string') return { kind: 'invalid', url: '' };
  const parsed = parsedHttpOrSiteUrl(value);
  if (!parsed) return { kind: 'invalid', url: '' };
  const url = value.trim();
  if (DIRECT_MEDIA_EXTENSIONS.test(parsed.pathname)) return { kind: 'direct', url };
  if (isAllowedLearningEmbed(url)) return { kind: 'embed', url };
  return { kind: 'link', url };
}
