'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/api';

type Verification = { valid: false } | { valid: true; certificate: {
  recipientName: string; courseTitle: string; issuedAt: string; issuedVia: string;
} };

const sources: Record<string, string> = {
  PROCTORED_EXAM: 'Емтихан және проктор тексеруі',
  ADMIN_OVERRIDE: 'Әкімші шешімі',
  LEGACY: 'Бұрын берілген сертификат',
};

export default function VerifyCertificate({ code }: { code: string }) {
  const [result, setResult] = useState<Verification | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setResult(null);
    void fetch(`${API_URL}/certificates/verify/${encodeURIComponent(code)}`, {
      signal: controller.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    }).then(async (response) => {
      if (!response.ok) throw new Error('Verification unavailable');
      const data = await response.json();
      if (!controller.signal.aborted) setResult(data);
    }).catch(() => {
      if (!controller.signal.aborted) setError('Сертификатты қазір тексеру мүмкін болмады. Қайта көріңіз.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [code, retry]);

  return <main className="min-h-screen flex items-center justify-center p-6">
    <section className="card w-full max-w-xl space-y-5" aria-busy={loading}>
      <Link href="/" className="font-bold text-primary-700">ProctoLearn</Link>
      <h1 className="text-2xl font-bold">Сертификатты тексеру</h1>
      {loading && <p role="status">Тексерілуде...</p>}
      {error && <div role="alert" className="space-y-3"><p>{error}</p><button className="btn-primary" onClick={() => setRetry((value) => value + 1)}>Қайта тексеру</button></div>}
      {!loading && result?.valid === false && <p role="status" className="rounded-lg bg-amber-50 p-4">Бұл кодпен сертификат табылмады. Құжаттағы сілтемені тексеріңіз.</p>}
      {!loading && result?.valid && <>
        <p role="status" className="rounded-lg bg-green-50 p-4 font-semibold text-green-800">Сертификаттың берілгені расталды</p>
        <dl className="space-y-3 break-words">
          <div><dt className="text-sm text-gray-500">Алушы</dt><dd className="font-semibold">{result.certificate.recipientName}</dd></div>
          <div><dt className="text-sm text-gray-500">Курс</dt><dd>{result.certificate.courseTitle}</dd></div>
          <div><dt className="text-sm text-gray-500">Берілген күні</dt><dd><time dateTime={result.certificate.issuedAt}>{new Date(result.certificate.issuedAt).toLocaleDateString('kk-KZ')}</time></dd></div>
          <div><dt className="text-sm text-gray-500">Берілу негізі</dt><dd>{sources[result.certificate.issuedVia] ?? 'Сертификаттар тізіліміндегі жазба'}</dd></div>
        </dl>
        <p className="text-sm text-gray-600">Аты-жөні мен курсты ұсынылған құжатпен салыстырыңыз. Бұл бет сертификаттың берілгенін растайды; құжатты ұсынған адамның жеке басын тексермейді.</p>
      </>}
    </section>
  </main>;
}
