'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { certificateVerificationUrl } from '@/lib/public-links';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import LoadFailure from '@/components/LoadFailure';
import { NavIcon } from '@/components/nav-icon';

interface Certificate {
  id: string;
  qrCode: string;
  issuedAt: string;
  course: { title: string };
  user: { name: string };
}

export default function CertificatesPage() {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setOrigin(window.location.origin);
    api
      .get('/certificates/my')
      .then(({ data }) => {
        setCerts(data);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [retryKey]);

  const retry = () => {
    setLoading(true);
    setRetryKey((key) => key + 1);
  };

  if (loading) {
    return (
      <div role="status" aria-label="Сертификаттар жүктелуде" className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }
  if (loadError) return <LoadFailure onRetry={retry} />;

  const downloadPdf = async (certId: string, courseTitle: string) => {
    try {
      const { data } = await api.get(`/certificates/${certId}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `certificate-${courseTitle}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('PDF жүктеу қатесі');
    }
  };

  return (
    <div>
      <div className="workspace-page-header"><div><p className="workspace-eyebrow">Жетістіктеріңіз</p><h1 className="font-bold text-gray-900">Менің сертификаттарым</h1><p className="mt-3 text-sm text-slate-500">Оқу нәтижесін сақтаңыз және QR арқылы тексеріңіз.</p></div><span className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">{certs.length} сертификат</span></div>

      {certs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-gray-500">
          <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-violet-50 text-violet-600"><NavIcon icon="🏆" className="h-8 w-8" /></span>
          <h2 className="text-xl font-semibold text-slate-900">Алғашқы жетістігіңіз алда</h2>
          <p className="mx-auto mt-3 max-w-md text-sm">Курс талаптарын орындағаннан кейін берілген сертификаттарыңыз осында көрсетіледі.</p>
          <Link href="/dashboard/courses" className="btn-primary mt-6 inline-flex">Курстарды қарау</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
          {certs.map((cert) => (
            <div key={cert.id} className="workspace-certificate">
              <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-violet-100 text-violet-700"><NavIcon icon="🏆" className="h-6 w-6" /></span>
              <p className="workspace-eyebrow">ProctoLearn · Сертификат</p>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{cert.course.title}</h3>
              <p className="mb-2 text-sm font-medium text-slate-700">{cert.user.name}</p>
              <p className="text-sm text-gray-500 mb-5">
                {new Date(cert.issuedAt).toLocaleDateString('kk-KZ')}
              </p>
              <div className="flex justify-center rounded-xl border border-slate-200 bg-white p-3 mb-4">
                {origin && <QRCodeSVG value={certificateVerificationUrl(origin, cert.qrCode)} size={120} title="Сертификатты тексеру QR коды" />}
              </div>
              <p className="text-xs text-gray-500 mb-4">Тексеру үшін QR кодын сканерлеңіз</p>
              <Link href={`/verify/${encodeURIComponent(cert.qrCode)}`} className="block text-sm text-primary-700 underline mb-4">Сертификатты тексеру</Link>
              <button
                onClick={() => downloadPdf(cert.id, cert.course.title)}
                className="btn-primary mt-auto w-full flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                PDF жүктеу
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
