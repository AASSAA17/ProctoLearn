'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import LoadFailure from '@/components/LoadFailure';

interface Progress {
  user: { id: string; name: string; email: string };
  courses: Array<{
    courseId: string; courseTitle: string;
    totalLessons: number; progress: number; lastActivity: string;
    viewedLessons: Array<{ id: string; title: string; order: number; viewedAt: string }>;
  }>;
}

interface Course {
  id: string;
  title: string;
}

type ActionType = 'certificate' | 'exam' | null;

export default function UserProgressPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [certificates, setCertificates] = useState<Array<{ id: string; course: { title: string }; status: string; issuedAt: string }>>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState(false);

  // Grant modal state
  const [grantModal, setGrantModal] = useState<{
    type: ActionType;
    courseId: string;
    courseTitle: string;
  } | null>(null);
  const [newCourseModal, setNewCourseModal] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedActionType, setSelectedActionType] = useState<'certificate' | 'exam'>('exam');

  const loadProgress = useCallback(() => {
    return Promise.all([
      api.get(`/admin/users/${id}/progress`).then(r => setData(r.data)),
      api.get(`/admin/users/${id}/certificates`).then(r => setCertificates(r.data)),
      api.get('/courses').then(r => {
        const raw = r.data;
        setCourses(Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : []);
      }),
    ]).then(() => setLoadError(false));
  }, [id]);

  useEffect(() => {
    setLoading(true);
    loadProgress().catch(() => setLoadError(true)).finally(() => setLoading(false));
  }, [loadProgress]);

  const handleGrant = async (type: 'certificate' | 'exam', courseId: string) => {
    const key = `${type}-${courseId}`;
    setActionLoading(key);
    try {
      if (type === 'certificate') {
        await api.post(`/admin/users/${id}/grant-certificate/${courseId}`);
        toast.success('✅ Сертификат сәтті берілді');
      } else {
        await api.post(`/admin/users/${id}/grant-exam-access/${courseId}`);
        toast.success('✅ Экзаменге кіру рұқсаты берілді');
      }
      await loadProgress();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Қате болды');
    } finally {
      setActionLoading(null);
      setGrantModal(null);
    }
  };

  const handleNewCourseGrant = async () => {
    if (!selectedCourseId) { toast.error('Курс таңдаңыз'); return; }
    await handleGrant(selectedActionType, selectedCourseId);
    setNewCourseModal(false);
    setSelectedCourseId('');
  };

  if (loading) return <div className="text-center py-16 text-gray-400">Жүктелуде...</div>;
  if (loadError) return <LoadFailure onRetry={() => { setLoading(true); void loadProgress().catch(() => setLoadError(true)).finally(() => setLoading(false)); }} />;
  if (!data) return null;

  const enrolledCourseIds = new Set(data.courses.map(c => c.courseId));
  const unenrolledCourses = courses.filter(c => !enrolledCourseIds.has(c.id));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <Link href="/dashboard/admin/users" className="text-sm text-blue-600 hover:underline">← Пайдаланушылар</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{data.user.name} — Курс барысы</h1>
          <p className="text-gray-500 text-sm">{data.user.email}</p>
        </div>
        <button
          onClick={() => { setNewCourseModal(true); setSelectedCourseId(''); setSelectedActionType('exam'); }}
          className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg font-medium flex items-center gap-2"
        >
          🎓 Жаңа курсқа рұқсат беру
        </button>
      </div>

      {data.courses.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
          Пайдаланушы әлі бірде-бір сабақ ашқан жоқ
        </div>
      ) : (
        <div className="space-y-6">
          {data.courses.map((c) => (
            <div key={c.courseId} className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between mb-3 gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{c.courseTitle}</h2>
                  <p className="text-sm text-gray-500">
                    {c.viewedLessons.length} / {c.totalLessons} сабақ қаралды •{' '}
                    Соңғы белсенділік: {new Date(c.lastActivity).toLocaleString('kk-KZ')}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-2xl font-bold text-blue-600">{c.progress}%</span>
                  <button
                    onClick={() => setGrantModal({ type: 'exam', courseId: c.courseId, courseTitle: c.courseTitle })}
                    disabled={actionLoading === `exam-${c.courseId}`}
                    className="text-xs bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                  >
                    📝 Экзаменге жіберу
                  </button>
                  <button
                    onClick={() => setGrantModal({ type: 'certificate', courseId: c.courseId, courseTitle: c.courseTitle })}
                    disabled={actionLoading === `certificate-${c.courseId}`}
                    className="text-xs bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                  >
                    🏆 Сертификат беру
                  </button>
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

      <section aria-labelledby="user-certificates-title" className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 id="user-certificates-title" className="mb-4 text-lg font-semibold">Сертификаттар</h2>
        {certificates.length === 0 && <p className="text-sm text-slate-500">Берілген сертификаттар жоқ.</p>}
        <div className="space-y-5">{certificates.map(cert => <article key={cert.id} className="rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold break-words">{cert.course.title}</h3>
          <p className="mt-2 text-sm">{cert.status === 'REVOKED' ? 'Күші жойылған' : 'Жарамды'} · {new Date(cert.issuedAt).toLocaleDateString('kk-KZ')}</p>
          {cert.status === 'VALID' && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-red-700">Сертификатты кері қайтару</summary>
            <form className="mt-4 space-y-3" onSubmit={async event => {
              event.preventDefault(); if (actionLoading || !reasons[cert.id]?.trim()) return;
              setActionLoading(`revoke-${cert.id}`);
              try { await api.post(`/admin/certificates/${cert.id}/revoke`, { reason: reasons[cert.id].trim() }); await loadProgress(); toast.success('Сертификаттың күші жойылды'); }
              catch { toast.error('Сертификатты кері қайтару расталмады. Қайта тексеріңіз.'); }
              finally { setActionLoading(null); }
            }}>
              <p className="text-sm text-red-800">Бұл әрекет қайтарылмайды. Осы QR-код жарамсыз мәртебені көрсетеді.</p>
              <label className="block text-sm font-medium" htmlFor={`revoke-${cert.id}`}>Кері қайтару себебі</label>
              <textarea id={`revoke-${cert.id}`} className="input min-h-24 w-full" required maxLength={500} value={reasons[cert.id] ?? ''} onChange={event => setReasons(current => ({ ...current, [cert.id]: event.target.value }))} />
              <button className="min-h-11 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!!actionLoading || !reasons[cert.id]?.trim()}>Кері қайтаруды растау</button>
            </form>
          </details>}
        </article>)}</div>
      </section>

      {/* Confirm Grant Modal */}
      {grantModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {grantModal.type === 'certificate' ? '🏆 Сертификат беру' : '📝 Экзаменге жіберу'}
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              <strong>Курс:</strong> {grantModal.courseTitle}
            </p>
            <p className="text-sm text-gray-600 mb-1">
              <strong>Пайдаланушы:</strong> {data.user.name}
            </p>
            <div className={`rounded-lg p-4 my-4 text-sm ${grantModal.type === 'certificate' ? 'bg-green-50 text-green-800' : 'bg-orange-50 text-orange-800'}`}>
              {grantModal.type === 'certificate'
                ? '⚠️ Барлық сабақтар оқылған деп белгіленеді, enrollment аяқталады және сертификат беріледі.'
                : '⚠️ Барлық сабақтар оқылған деп белгіленеді. Пайдаланушы экзаменді таба алады.'}
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setGrantModal(null)}
                className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 font-semibold hover:bg-gray-50"
              >
                Болдырмау
              </button>
              <button
                onClick={() => handleGrant(grantModal.type!, grantModal.courseId)}
                disabled={!!actionLoading}
                className={`flex-1 text-white rounded-lg py-2.5 font-semibold disabled:opacity-50 ${
                  grantModal.type === 'certificate' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-500 hover:bg-orange-600'
                }`}
              >
                {actionLoading ? '...' : 'Растау'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Course Grant Modal */}
      {newCourseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">🎓 Курсқа рұқсат беру</h3>
            <p className="text-sm text-gray-500 mb-4">
              <strong>{data.user.name}</strong> үшін курс таңдаңыз
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Курс</label>
                <select
                  value={selectedCourseId}
                  onChange={e => setSelectedCourseId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">— Курс таңдаңыз —</option>
                  {unenrolledCourses.length > 0 && (
                    <optgroup label="Тіркелмеген курстар">
                      {unenrolledCourses.map(c => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </optgroup>
                  )}
                  {data.courses.length > 0 && (
                    <optgroup label="Бар курстар (жаңарту)">
                      {data.courses.map(c => (
                        <option key={c.courseId} value={c.courseId}>{c.courseTitle} ({c.progress}%)</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Рұқсат түрі</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedActionType('exam')}
                    className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      selectedActionType === 'exam'
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    📝 Экзаменге жіберу
                  </button>
                  <button
                    onClick={() => setSelectedActionType('certificate')}
                    className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      selectedActionType === 'certificate'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    🏆 Сертификат беру
                  </button>
                </div>
              </div>

              <div className={`rounded-lg p-3 text-xs ${selectedActionType === 'certificate' ? 'bg-green-50 text-green-800' : 'bg-orange-50 text-orange-800'}`}>
                {selectedActionType === 'certificate'
                  ? 'Барлық сабақтар оқылған деп белгіленеді, enrollment аяқталады және сертификат беріледі.'
                  : 'Барлық сабақтар оқылған деп белгіленеді. Пайдаланушы экзаменге кіре алады.'}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setNewCourseModal(false)}
                className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 font-semibold hover:bg-gray-50"
              >
                Болдырмау
              </button>
              <button
                onClick={handleNewCourseGrant}
                disabled={!!actionLoading || !selectedCourseId}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg py-2.5 font-semibold disabled:opacity-50"
              >
                {actionLoading ? '...' : 'Растау'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
