'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api, { API_URL } from '@/lib/api';
import toast from 'react-hot-toast';

interface User {
  id: string; name: string; email: string; phone: string | null;
  role: string; createdAt: string; lastSeen: string | null; isOnline: boolean;
  mustChangePassword: boolean;
  _count: { attempts: number; certificates: number };
}

const ROLE_LABELS: Record<string, string> = {
  STUDENT: 'Студент', TEACHER: 'Мұғалім', PROCTOR: 'Проктор', ADMIN: 'Admin',
};
const ROLE_COLORS: Record<string, string> = {
  STUDENT: 'bg-blue-100 text-blue-700', TEACHER: 'bg-green-100 text-green-700',
  PROCTOR: 'bg-orange-100 text-orange-700', ADMIN: 'bg-red-100 text-red-700',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState<string | null>(null);
  const [tempPassModal, setTempPassModal] = useState<{ email: string; pass: string } | null>(null);

  const load = (q = '') => {
    setLoading(true);
    api.get('/admin/users', { params: q ? { search: q } : {} })
      .then((r) => {
        const raw = r.data;
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
        setUsers(list);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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
      setTempPassModal({ email: data.email, pass: data.tempPassword });
      toast.success('Уақытша пароль жіберілді');
      load(search);
    } catch { toast.error('Қате болды'); }
    finally { setResetting(null); }
  };

  const downloadExcel = () => {
    const token = localStorage.getItem('accessToken');
    fetch(`${API_URL}/admin/export/users`,
      { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob()).then(blob => {
        const u = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = u; a.download = 'пайдаланушылар.xlsx'; a.click();
        URL.revokeObjectURL(u);
      });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/dashboard/admin" className="text-sm text-blue-600 hover:underline">← Артқа</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Пайдаланушылар</h1>
        </div>
        <button onClick={downloadExcel}
          className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg">
          📥 Excel жүктеу
        </button>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={search} onChange={e => setSearch(e.target.value)} placeholder="Атауы немесе email бойынша іздеу..." />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg">Іздеу</button>
        {search && <button type="button" onClick={() => { setSearch(''); load(''); }} className="text-gray-500 px-3">✕</button>}
      </form>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Жүктелуде...</div>
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
                          <p className="text-gray-400 text-xs">{u.email}</p>
                          {u.mustChangePassword && <span className="text-xs bg-yellow-100 text-yellow-700 px-1 rounded">Пароль өзгерту керек</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select value={u.role} onChange={e => updateRole(u.id, e.target.value)}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${ROLE_COLORS[u.role]}`}>
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
                      <div className="flex gap-2">
                        <Link href={`/dashboard/admin/users/${u.id}`}
                          className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-1 rounded">
                          Барыс
                        </Link>
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
            {users.length === 0 && <p className="text-center py-8 text-gray-400">Пайдаланушы табылмады</p>}
          </div>
        </div>
      )}

      {/* Уақытша пароль модалы */}
      {tempPassModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">✅ Уақытша пароль жасалды</h3>
            <p className="text-sm text-gray-600 mb-2"><strong>Email:</strong> {tempPassModal.email}</p>
            <div className="bg-gray-100 rounded-lg p-4 my-4 text-center">
              <code className="text-2xl font-mono font-bold text-blue-700 tracking-wider">{tempPassModal.pass}</code>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Email жіберу сәтсіз болса, бұл паролды пайдаланушыға өзіңіз беріңіз.
              Пайдаланушы жүйеге кіргеннен кейін паролды өзгертуі тиіс.
            </p>
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
