import {
  fetchPublicCertificateVerification,
  isCertificateVerificationCode,
} from '@/lib/public-certificate-verification';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const responseHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!isCertificateVerificationCode(code)) {
    return Response.json(
      { error: 'INVALID_CERTIFICATE_CODE' },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const verification = await fetchPublicCertificateVerification(code);
    return Response.json(verification, { status: 200, headers: responseHeaders });
  } catch {
    return Response.json(
      { error: 'VERIFICATION_UNAVAILABLE' },
      { status: 503, headers: responseHeaders },
    );
  }
}
