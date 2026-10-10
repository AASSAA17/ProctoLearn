'use client';

import { useEffect, useState } from 'react';
import { PremiumPublicFrame } from '@/components/PremiumPublicFrame';
import { ShieldCheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

type Verification = { valid: false; status?: string } | { valid: true; certificate: {
  recipientName: string | null; courseTitle: string | null; issuerName: string | null; issuedAt: string; issuedVia: string; snapshotStatus?: string;
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
    void fetch(`/api/public/certificates/verify/${encodeURIComponent(code)}`, {
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

  return <PremiumPublicFrame verificationOnly>
    <section className="mx-auto max-w-2xl" aria-busy={loading}>
      <div className="mb-8 text-center"><p className="mb-4 text-xs font-semibold uppercase tracking-[.22em] text-violet-300">ProctoLearn / Сертификаттар тізілімі</p><h1 className="text-3xl font-semibold sm:text-4xl">Сертификатты тексеру</h1><p className="mt-4 text-sm leading-relaxed text-slate-400">Құжаттың берілгені туралы ресми жазба.</p></div>
      <div className="overflow-hidden rounded-[2rem] border border-white/15 bg-[#111625] p-6 shadow-[0_24px_80px_-32px_rgba(124,58,237,.25)] sm:p-10">
      {loading && <div role="status" className="space-y-6 py-8 text-center text-slate-300"><div aria-hidden="true" className="mx-auto size-16 rounded-2xl border border-violet-400/30 bg-violet-500/10 motion-safe:animate-pulse" /><p>Тексерілуде...</p></div>}
{error && <div role="alert" className="space-y-5 rounded-2xl border border-red-400/30 bg-red-950/20 p-6 text-red-200"><ExclamationTriangleIcon className="size-8" aria-hidden="true" /><p>{error}</p><button className="min-h-12 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700" onClick={() => setRetry((value) => value + 1)}>Қайта тексеру</button></div>}
      {!loading && result?.valid === false && <div role="status" className="rounded-2xl border border-amber-400/30 bg-amber-950/20 p-6 text-amber-200"><ExclamationTriangleIcon aria-hidden="true" className="mb-4 size-9" /><h2 className="mb-3 text-xl font-semibold">{result.status === 'REVOKED' ? 'Сертификаттың күші жойылған' : 'Сертификат табылмады'}</h2><p className="text-sm leading-relaxed">{result.status === 'REVOKED' ? 'Бұл сертификат кері қайтарылған және жарамсыз.' : 'Бұл кодпен сертификат табылмады. Құжаттағы сілтемені тексеріңіз.'}</p></div>}
      {!loading && result?.valid && <>
        <div role="status" className="mb-8 flex items-center gap-4 border-b border-white/10 pb-8"><span className="grid size-14 shrink-0 place-items-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10"><ShieldCheckIcon className="size-8 text-emerald-300" aria-hidden="true" /></span><p className="font-semibold text-emerald-300">Сертификаттың берілгені расталды</p></div>
        <dl className="grid gap-7 break-words sm:grid-cols-2">
          <div className="sm:col-span-2"><dt className="mb-2 text-xs uppercase tracking-widest text-slate-400">Алушы</dt><dd className="text-2xl font-semibold">{result.certificate.recipientName ?? 'Тарихи аты-жөні сақталмаған'}</dd></div>
          <div className="sm:col-span-2"><dt className="mb-2 text-xs uppercase tracking-widest text-slate-400">Курс</dt><dd className="text-xl text-violet-200">{result.certificate.courseTitle ?? 'Тарихи курс атауы сақталмаған'}</dd></div>
          <div><dt className="mb-2 text-xs uppercase tracking-widest text-slate-400">Беруші</dt><dd className="text-sm">{result.certificate.issuerName ?? 'ProctoLearn'}</dd></div>
          <div><dt className="mb-2 text-xs uppercase tracking-widest text-slate-400">Берілген күні</dt><dd className="text-sm"><time dateTime={result.certificate.issuedAt}>{new Date(result.certificate.issuedAt).toLocaleDateString('kk-KZ')}</time></dd></div>
          <div><dt className="mb-2 text-xs uppercase tracking-widest text-slate-400">Берілу негізі</dt><dd className="text-sm">{sources[result.certificate.issuedVia] ?? 'Сертификаттар тізіліміндегі жазба'}</dd></div>
        </dl>
        {result.certificate.snapshotStatus === 'LEGACY_UNAVAILABLE' && <p className="mt-6 text-sm text-amber-200">Бұрынғы жазба: берілген сәттегі деректер сақталмаған. Тарихи аты-жөні мен курс атауын растау мүмкін емес.</p>}
        <p className="mt-8 rounded-xl border border-white/10 bg-white/[.03] p-4 text-xs leading-relaxed text-slate-400">Аты-жөні мен курсты ұсынылған құжатпен салыстырыңыз. Бұл бет сертификаттың берілгенін растайды; құжатты ұсынған адамның жеке басын тексермейді.</p>
      </>}
      </div>
    </section>
  </PremiumPublicFrame>;
}
