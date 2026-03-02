'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

interface Progress {
  user: { id: string; name: string; email: string };
  courses: Array<{
    courseId: string; courseTitle: string;
    totalLessons: number; progress: number; lastActivity: string;
    viewedLessons: Array<{ id: string; title: string; order: number; viewedAt: string }>;
  }>;
}

export default function UserProgressPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/admin/users/${id}/progress`)
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-center py-16 text-gray-400">Жүктелуде...</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/admin/users" className="text-sm text-blue-600 hover:underline">← Пайдаланушылар</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">{data.user.name} — Курс барысы</h1>
        <p className="text-gray-500 text-sm">{data.user.email}</p>
      </div>

      {data.courses.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
          Пайдаланушы әлі бірде-бір сабақ ашқан жоқ
        </div>
      ) : (
        <div className="space-y-6">
          {data.courses.map((c) => (
            <div key={c.courseId} className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{c.courseTitle}</h2>
                  <p className="text-sm text-gray-500">
                    {c.viewedLessons.length} / {c.totalLessons} сабақ қаралды •{' '}
                    Соңғы белсенділік: {new Date(c.lastActivity).toLocaleString('kk-KZ')}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-blue-600">{c.progress}%</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                <div className="bg-blue-500 h-2.5 rounded-full transition-all"
                  style={{ width: `${c.progress}%` }} />
              </div>

              {/* Viewed lessons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {c.viewedLessons.sort((a, b) => a.order - b.order).map((l) => (
                  <div key={l.id} className="flex items-center gap-2 text-sm bg-green-50 rounded-lg px-3 py-2">
                    <span className="text-green-500">✓</span>
                    <span className="text-gray-700">{l.order}. {l.title}</span>
                    <span className="ml-auto text-xs text-gray-400">
                      {new Date(l.viewedAt).toLocaleDateString('kk-KZ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
