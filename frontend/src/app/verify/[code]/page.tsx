import type { Metadata } from 'next';
import VerifyCertificate from './verify-certificate';

export const metadata: Metadata = {
  title: 'Сертификатты тексеру — ProctoLearn',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <VerifyCertificate code={code} />;
}
