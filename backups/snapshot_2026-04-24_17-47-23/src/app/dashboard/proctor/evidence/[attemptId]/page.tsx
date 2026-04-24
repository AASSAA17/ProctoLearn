'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import Link from 'next/link';

function EvidenceCard({ ev }: { ev: any }) {
  const isVideo = ev.type?.startsWith('recording_');
  const label = ev.type === 'recording_camera' ? 'Камера' : ev.type === 'recording_screen' ? 'Экран' : 'Файл';

  return (
    <div className="card p-3 flex flex-col">
      <span className="text-xs font-medium text-primary-600 mb-2">{label}</span>
      {isVideo ? (
        <video
          src={ev.url}
          controls
          preload="metadata"
          className="w-full rounded bg-gray-900 aspect-video"
        />
      ) : (
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
      )}
      <p className="text-xs text-gray-400 mt-2 text-center">
        {new Date(ev.createdAt).toLocaleTimeString('kk-KZ')}
      </p>
    </div>
  );
}

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

  const cameras = evidences.filter((e) => e.type === 'recording_camera');
  const screens = evidences.filter((e) => e.type === 'recording_screen');
  const other = evidences.filter((e) => !e.type?.startsWith('recording_'));

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
        <div className="space-y-8">
          {cameras.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">📹 Камера жазбалары</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cameras.map((ev) => <EvidenceCard key={ev.id} ev={ev} />)}
              </div>
            </section>
          )}
          {screens.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">🖥️ Экран жазбалары</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {screens.map((ev) => <EvidenceCard key={ev.id} ev={ev} />)}
              </div>
            </section>
          )}
          {other.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">📎 Басқа дәлелдемелер</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {other.map((ev) => <EvidenceCard key={ev.id} ev={ev} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
