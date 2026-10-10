const CERTIFICATE_VERIFICATION_UPSTREAM = 'http://127.0.0.1:4000';
const CERTIFICATE_VERIFICATION_TIMEOUT_MS = 10_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicCertificateVerification =
  | { valid: false; status?: 'REVOKED' }
  | {
    valid: true;
    certificate: {
      recipientName: string | null;
      courseTitle: string | null;
      issuerName: string | null;
      issuedAt: string;
      issuedVia: 'PROCTORED_EXAM' | 'ADMIN_OVERRIDE' | 'LEGACY';
      snapshotStatus?: 'LEGACY_UNAVAILABLE';
    };
  };

type UpstreamFetch = (input: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;

export class PublicCertificateVerificationUnavailable extends Error {
  constructor() {
    super('Certificate verification is unavailable');
    this.name = 'PublicCertificateVerificationUnavailable';
  }
}

export function isCertificateVerificationCode(code: string): boolean {
  return UUID_PATTERN.test(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function publicText(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 500) return undefined;
  return value;
}

/** Rebuild the response from the explicit public field allowlist. */
export function publicCertificateVerification(value: unknown): PublicCertificateVerification | null {
  if (!isRecord(value) || typeof value.valid !== 'boolean') return null;

  if (!value.valid) {
    return value.status === 'REVOKED' ? { valid: false, status: 'REVOKED' } : { valid: false };
  }

  if (!isRecord(value.certificate)) return null;
  const recipientName = publicText(value.certificate.recipientName);
  const courseTitle = publicText(value.certificate.courseTitle);
  const issuerName = publicText(value.certificate.issuerName);
  const issuedAt = value.certificate.issuedAt;
  if (recipientName === undefined || courseTitle === undefined || issuerName === undefined
    || typeof issuedAt !== 'string' || issuedAt.length > 64
    || !Number.isFinite(Date.parse(issuedAt)) || new Date(issuedAt).toISOString() !== issuedAt) return null;

  const issuedVia = value.certificate.issuedVia;
  const publicIssuedVia = issuedVia === 'PROCTORED_EXAM' || issuedVia === 'ADMIN_OVERRIDE'
    ? issuedVia
    : 'LEGACY';

  return {
    valid: true,
    certificate: {
      recipientName,
      courseTitle,
      issuerName,
      issuedAt,
      issuedVia: publicIssuedVia,
      ...(value.certificate.snapshotStatus === 'LEGACY_UNAVAILABLE'
        ? { snapshotStatus: 'LEGACY_UNAVAILABLE' as const }
        : {}),
    },
  };
}

export async function fetchPublicCertificateVerification(
  code: string,
  fetchUpstream: UpstreamFetch = fetch,
): Promise<PublicCertificateVerification> {
  try {
    const response = await fetchUpstream(
      `${CERTIFICATE_VERIFICATION_UPSTREAM}/certificates/verify/${encodeURIComponent(code)}`,
      {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(CERTIFICATE_VERIFICATION_TIMEOUT_MS),
      },
    );
    if (!response.ok) throw new PublicCertificateVerificationUnavailable();

    const verification = publicCertificateVerification(await response.json());
    if (!verification) throw new PublicCertificateVerificationUnavailable();
    return verification;
  } catch {
    throw new PublicCertificateVerificationUnavailable();
  }
}
