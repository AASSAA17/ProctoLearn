'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import Image from 'next/image';
import Link from 'next/link';

export default function EvidencePage() {
  const { attemptId } = useParams();
  const [evidences, setEvidences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/evidence/${attemptId}`)
      .then(({ data }) => setEvidences(data))
      .finally(() => setLoading(false));
  }, [attemptId]);

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/proctor" className="text-primary-600 hover:underline text-sm">
          ← Проктор панеліне оралу
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-8">
        Дәлелдемелер — {String(attemptId).slice(0, 8)}...
      </h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
        </div>
      ) : evidences.length === 0 ? (
        <p className="text-gray-400 text-center py-12">Дәлелдеме жоқ</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {evidences.map((ev) => (
            <div key={ev.id} className="card p-2">
              <a href={ev.url} target="_blank" rel="noopener noreferrer">
                <img
                  src={ev.url}
                  alt="screenshot"
                  className="w-full h-40 object-cover rounded"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="160" viewBox="0 0 200 160"><rect fill="%23e5e7eb" width="200" height="160"/><text fill="%239ca3af" x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="14">Скриншот</text></svg>';
                  }}
                />
              </a>
              <p className="text-xs text-gray-400 mt-1 text-center">
                {new Date(ev.createdAt).toLocaleTimeString('kk-KZ')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
