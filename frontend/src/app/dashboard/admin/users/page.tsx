'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { downloadFile } from '@/lib/download';
import toast from 'react-hot-toast';
import LoadFailure from '@/components/LoadFailure';
import { useAuthStore } from '@/store/auth.store';

interface User {
  id: string; name: string; email: string; phone: string | null;
  role: string; createdAt: string; lastSeen: string | null; isOnline: boolean;
  mustChangePassword: boolean;
  _count: { attempts: number; certificates: number };
}

interface Course {
  id: string;
  title: string;
}

const ROLE_LABELS: Record<string, string> = {
  STUDENT: 'Студент', TEACHER: 'Мұғалім', PROCTOR: 'Проктор', ADMIN: 'Admin',
};
const ROLE_COLORS: Record<string, string> = {
  STUDENT: 'bg-blue-100 text-blue-700', TEACHER: 'bg-green-100 text-green-700',
  PROCTOR: 'bg-orange-100 text-orange-700', ADMIN: 'bg-red-100 text-red-700',
};

export default function AdminUsersPage() {
  const currentUserId = useAuthStore(state => state.user?.id);
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [tempPassModal, setTempPassModal] = useState<{ email: string } | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesError, setCoursesError] = useState(false);

  // Grant access modal
  const [grantModal, setGrantModal] = useState<{ user: User } | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedActionType, setSelectedActionType] = useState<'certificate' | 'exam'>('exam');
  const [grantLoading, setGrantLoading] = useState(false);

  const load = (q = '') => {
    setLoading(true);
    api.get('/admin/users', { params: q ? { search: q } : {} })
      .then((r) => {
        const raw = r.data;
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
        setUsers(list);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  const loadCourses = () => {
    api.get('/courses').then(r => {
      const raw = r.data;
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      setCourses(list);
      setCoursesError(false);
    }).catch(() => setCoursesError(true));
  };

  useEffect(() => {
    load();
    loadCourses();
  }, []);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(search); };

  const updateRole = async (id: string, role: string) => {
    try {
      await api.patch(`/users/${id}/role`, { role });
      toast.success('Рөл өзгертілді');
      load(search);
    } catch { toast.error('Қате болды'); }
  };

  const resetPassword = async (id: string) => {
    setResetting(id);
    try {
      const { data } = await api.post(`/admin/users/${id}/reset-password`);
      setTempPassModal({ email: data.email });
      toast.success('Уақытша пароль жіберілді');
      load(search);
    } catch { toast.error('Қате болды'); }
    finally { setResetting(null); }
  };

  const downloadExcel = async () => {
    try { await downloadFile('/admin/export/users', 'пайдаланушылар.xlsx'); }
    catch { toast.error('Excel файлын жүктеу мүмкін болмады.'); }
  };

  const openGrantModal = (user: User) => {
    setGrantModal({ user });
    setSelectedCourseId('');
    setSelectedActionType('exam');
  };

  const handleGrant = async () => {
    if (!grantModal || !selectedCourseId) { toast.error('Курс таңдаңыз'); return; }
    setGrantLoading(true);
    try {
      const userId = grantModal.user.id;
      if (selectedActionType === 'certificate') {
        await api.post(`/admin/users/${userId}/grant-certificate/${selectedCourseId}`);
        toast.success('✅ Сертификат сәтті берілді');
      } else {
        await api.post(`/admin/users/${userId}/grant-exam-access/${selectedCourseId}`);
        toast.success('✅ Экзаменге кіру рұқсаты берілді');
      }
      setGrantModal(null);
      load(search);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Қате болды');
    } finally {
      setGrantLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/dashboard/admin" className="text-sm text-blue-600 hover:underline">← Артқа</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Пайдаланушылар</h1>
        </div>
        <button onClick={downloadExcel}
          className="bg-green-700 hover:bg-green-800 text-white text-sm px-4 py-2 rounded-lg">
          📥 Excel жүктеу
        </button>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input aria-label="Пайдаланушыны іздеу" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={search} onChange={e => setSearch(e.target.value)} placeholder="Атауы немесе email бойынша іздеу..." />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg">Іздеу</button>
        {search && <button type="button" onClick={() => { setSearch(''); load(''); }} className="text-gray-500 px-3">✕</button>}
      </form>

      {loading ? (
        <div className="text-center py-12 text-gray-600">Жүктелуде...</div>
      ) : loadError ? (
        <LoadFailure onRetry={() => load(search)} />
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Пайдаланушы', 'Рөл', 'Телефон', 'Белсенділік', 'Нәтижелер', 'Сертификат', 'Әрекет'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-gray-600 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(Array.isArray(users) ? users : []).map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${u.isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <div>
                          <p className="font-medium text-gray-900">{u.name}</p>
                          <p className="text-gray-600 text-xs">{u.email}</p>
                          {u.mustChangePassword && <span className="text-xs bg-yellow-100 text-yellow-700 px-1 rounded">Пароль өзгерту керек</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select value={u.role} aria-label={`${u.name}: рөл`} onChange={e => updateRole(u.id, e.target.value)}
                        disabled={u.id === currentUserId}
                        title={u.id === currentUserId ? 'Өз рөліңізді өзгертуге болмайды' : undefined}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${u.id === currentUserId ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${ROLE_COLORS[u.role]}`}>
                        {Object.keys(ROLE_LABELS).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{u.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {u.lastSeen ? new Date(u.lastSeen).toLocaleString('kk-KZ') : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">{u._count.attempts}</td>
                    <td className="px-4 py-3 text-center">{u._count.certificates}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        <Link href={`/dashboard/admin/users/${u.id}`}
                          className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-1 rounded">
                          Барыс
                        </Link>
                        {u.role === 'STUDENT' && <button onClick={() => openGrantModal(u)}
                          className="text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 px-2 py-1 rounded">
                          🎓 Рұқсат
                        </button>}
                        <button onClick={() => resetPassword(u.id)} disabled={resetting === u.id}
                          className="text-xs bg-red-50 text-red-700 hover:bg-red-100 px-2 py-1 rounded disabled:opacity-50">
                          {resetting === u.id ? '...' : 'Пароль'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && <p className="text-center py-8 text-gray-600">Пайдаланушы табылмады</p>}
          </div>
        </div>
      )}

      {/* Grant Access Modal */}
      {grantModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-1">🎓 Курсқа рұқсат беру</h3>
            <p className="text-sm text-gray-500 mb-4">
              <strong>{grantModal.user.name}</strong> ({grantModal.user.email})
            </p>

            <div className="space-y-4">
              {coursesError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">Курстарды жүктеу мүмкін болмады. <button type="button" onClick={loadCourses} className="font-semibold underline">Қайта жүктеу</button></div>}
              <div>
                <label htmlFor="grant-course" className="block text-sm font-medium text-gray-700 mb-1">Курс</label>
                <select
                  id="grant-course"
                  value={selectedCourseId}
                  onChange={e => setSelectedCourseId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">— Курс таңдаңыз —</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
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
                onClick={() => setGrantModal(null)}
                className="flex-1 border border-gray-200 text-gray-700 rounded-lg py-2.5 font-semibold hover:bg-gray-50"
              >
                Болдырмау
              </button>
              <button
                onClick={handleGrant}
                disabled={grantLoading || coursesError || !selectedCourseId}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg py-2.5 font-semibold disabled:opacity-50"
              >
                {grantLoading ? '...' : 'Растау'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Уақытша пароль модалы */}
      {tempPassModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">✅ Уақытша пароль жасалды</h3>
            <p className="text-sm text-gray-600 mb-2"><strong>Email:</strong> {tempPassModal.email}</p>
            <p className="text-sm text-gray-700 my-4">Уақытша пароль пайдаланушының поштасына жіберілді. Кіргеннен кейін оны ауыстыру қажет.</p>
            <button onClick={() => setTempPassModal(null)}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-semibold hover:bg-blue-700">
              Жабу
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
