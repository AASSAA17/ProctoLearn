'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

interface OnlineUser {
  id: string; name: string; email: string; role: string; lastSeen: string;
}

const ROLE_LABELS: Record<string, string> = {
  STUDENT: 'Студент', TEACHER: 'Мұғалім', PROCTOR: 'Проктор', ADMIN: 'Admin',
};

export default function AdminOnlinePage() {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = () => {
    api.get('/admin/users/online')
      .then(r => { setUsers(r.data); setLastUpdate(new Date()); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 30000); // Авто-жаңарту 30 сек
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const secondsAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 60000) return `${Math.floor(diff / 1000)} сек. бұрын`;
    return `${Math.floor(diff / 60000)} мин. бұрын`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/admin" className="text-sm text-blue-600 hover:underline">← Артқа</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">🟢 Онлайн пайдаланушылар</h1>
          <p className="text-gray-500 text-sm">Соңғы 5 минутта белсенді болғандар</p>
        </div>
        <div className="text-right">
          <button onClick={load} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg">
            🔄 Жаңарту
          </button>
          <p className="text-xs text-gray-400 mt-1">
            Жаңартылды: {lastUpdate.toLocaleTimeString('kk-KZ')}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-green-500">
        <p className="text-2xl font-bold text-green-600">{users.length}</p>
        <p className="text-sm text-gray-500">Қазіргі уақытта онлайн</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Жүктелуде...</div>
      ) : users.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
          Қазір онлайн пайдаланушы жоқ
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u) => (
            <div key={u.id} className="bg-white rounded-xl shadow-sm p-4 border border-green-100">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{u.name}</p>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {ROLE_LABELS[u.role] || u.role}
                </span>
                <span className="text-xs text-gray-500">{secondsAgo(u.lastSeen)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">Бет автоматты түрде 30 секунд сайын жаңарады</p>
    </div>
  );
}
