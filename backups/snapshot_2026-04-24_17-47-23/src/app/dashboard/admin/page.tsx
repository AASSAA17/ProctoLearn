'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api, { API_URL } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';

interface Stats {
  users: { total: number; newThisWeek: number; online: number; byRole: Record<string, number> };
  courses: { total: number; totalLessons: number };
  attempts: { total: number; finished: number; inProgress: number };
  certificates: { total: number };
}

function StatCard({ title, value, sub, color }: { title: string; value: number; sub?: string; color: string }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${color} p-6`}>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-3xl font-bold text-gray-800 mt-1">{value.toLocaleString()}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.role !== 'ADMIN') { router.push('/dashboard'); return; }
    api.get('/admin/stats').then((r) => setStats(r.data)).finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="text-center py-16 text-gray-400">Жүктелуде...</div>;
  if (!stats) return null;

  const downloadExcel = (type: 'users' | 'courses') => {
    const token = localStorage.getItem('accessToken');
    const url = `${API_URL}/admin/export/${type}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}.xlsx`;
    // Pass token via window.open (or fetch)
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const u = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = u;
        link.download = `${type === 'users' ? 'пайдаланушылар' : 'курстар'}.xlsx`;
        link.click();
        URL.revokeObjectURL(u);
      });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Админ панелі</h1>
          <p className="text-gray-500 text-sm mt-1">Жалпы статистика және басқару</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => downloadExcel('users')}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2">
            📥 Excel: Пайдаланушылар
          </button>
          <button onClick={() => downloadExcel('courses')}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2">
            📥 Excel: Курстар
          </button>
        </div>
      </div>

      {/* Пайдаланушылар */}
      <div>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">👤 Пайдаланушылар</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Барлығы" value={stats.users.total} color="border-blue-500" />
          <StatCard title="Онлайн (5 мин)" value={stats.users.online} color="border-green-500" />
          <StatCard title="Осы аптада жаңа" value={stats.users.newThisWeek} color="border-yellow-500" />
          <StatCard title="Студенттер" value={stats.users.byRole.STUDENT || 0} color="border-purple-500" />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <StatCard title="Мұғалімдер" value={stats.users.byRole.TEACHER || 0} color="border-orange-400" />
          <StatCard title="Прокторлар" value={stats.users.byRole.PROCTOR || 0} color="border-red-400" />
          <StatCard title="Adminістраторлар" value={stats.users.byRole.ADMIN || 0} color="border-gray-400" />
        </div>
      </div>

      {/* Курстар & Талпынулар */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Курстар" value={stats.courses.total} color="border-teal-500" />
        <StatCard title="Сабақтар" value={stats.courses.totalLessons} color="border-cyan-500" />
        <StatCard title="Талпынулар" value={stats.attempts.total} sub={`${stats.attempts.finished} аяқталды`} color="border-indigo-500" />
        <StatCard title="Сертификаттар" value={stats.certificates.total} color="border-pink-500" />
      </div>

      {/* Жылдам сілтемелер */}
      <div>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">⚡ Жылдам өту</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { href: '/dashboard/admin/users', label: '👥 Пайдаланушылар', desc: 'Тізім, пароль жаңарту', color: 'bg-blue-50 border-blue-200 hover:bg-blue-100' },
            { href: '/dashboard/admin/courses', label: '📚 Курстар', desc: 'Статистика, белсенділік', color: 'bg-green-50 border-green-200 hover:bg-green-100' },
            { href: '/dashboard/admin/online', label: '🟢 Онлайн', desc: 'Қазіргі белсенді қолданушылар', color: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100' },
          ].map((item) => (
            <Link key={item.href} href={item.href}
              className={`border rounded-xl p-5 transition-colors ${item.color}`}>
              <p className="font-semibold text-gray-800">{item.label}</p>
              <p className="text-sm text-gray-500 mt-1">{item.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
