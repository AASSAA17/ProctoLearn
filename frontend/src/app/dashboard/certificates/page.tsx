'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';

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

  useEffect(() => {
    api
      .get('/certificates/my')
      .then(({ data }) => setCerts(data))
      .catch(() => toast.error('Сертификаттарды жүктеу қатесі'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const verifyUrl = (code: string) =>
    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/certificates/verify/${code}`;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Менің сертификаттарым</h1>

      {certs.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-4">🏆</p>
          <p className="text-lg">Сертификат жоқ. Емтиханнан өту арқылы алыңыз!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {certs.map((cert) => (
            <div key={cert.id} className="card text-center border-2 border-yellow-200 bg-yellow-50">
              <div className="text-4xl mb-3">🏆</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{cert.course.title}</h3>
              <p className="text-sm text-gray-500 mb-4">
                {new Date(cert.issuedAt).toLocaleDateString('kk-KZ')}
              </p>
              <div className="flex justify-center mb-4">
                <QRCodeSVG value={verifyUrl(cert.qrCode)} size={120} />
              </div>
              <p className="text-xs text-gray-400">Тексеру үшін QR кодын сканерлеңіз</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
