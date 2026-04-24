'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import Link from 'next/link';
import api from '@/lib/api';

interface Enrollment {
  id: string;
  courseId: string;
  completedAt: string | null;
  course: {
    id: string;
    title: string;
    level: string;
  };
  progress: number;
  completedLessons: number;
  totalLessons: number;
}

const LEVEL_COLOR: Record<string, string> = {
  BEGINNER: 'bg-green-100 text-green-700',
  INTERMEDIATE: 'bg-yellow-100 text-yellow-700',
  ADVANCED: 'bg-red-100 text-red-700',
};

const ROLE_GRAD: Record<string, string> = {
  STUDENT: 'from-primary-700 to-primary-500',
  TEACHER: 'from-purple-700 to-purple-500',
  PROCTOR: 'from-blue-700 to-blue-500',
  ADMIN: 'from-gray-800 to-gray-600',
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [activeEnrollments, setActiveEnrollments] = useState<Enrollment[]>([]);
  const [attempts, setAttempts] = useState<number>(0);
  const [certs, setCerts] = useState<number>(0);

  useEffect(() => {
    api.get('/enrollments/my').then((r) => {
      const all: Enrollment[] = Array.isArray(r.data) ? r.data : [];
      setActiveEnrollments(all.filter(e => !e.completedAt));
    }).catch(() => {});
    api.get('/attempts/my').then((r) => setAttempts(Array.isArray(r.data) ? r.data.length : 0)).catch(() => {});
    api.get('/certificates/my').then((r) => setCerts(Array.isArray(r.data) ? r.data.length : 0)).catch(() => {});
  }, []);

  if (!user) return null;

  const initials = user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  const grad = ROLE_GRAD[user.role] ?? ROLE_GRAD.STUDENT;

  const quickLinks = [
    { href: '/dashboard/courses', icon: '📚', label: 'Курстарды қарау', desc: 'Барлық курстар' },
    { href: '/dashboard/my-attempts', icon: '📊', label: 'Нәтижелерім', desc: `${attempts} емтихан` },
    { href: '/dashboard/certificates', icon: '🏆', label: 'Сертификаттар', desc: `${certs} сертификат` },
    ...(user.role === 'TEACHER' || user.role === 'ADMIN'
      ? [{ href: '/dashboard/teacher/courses', icon: '🎓', label: 'Мұғалім панелі', desc: 'Курс басқару' }]
      : []),
    ...(user.role === 'PROCTOR' || user.role === 'ADMIN'
      ? [{ href: '/dashboard/proctor', icon: '🔍', label: 'Проктор панелі', desc: 'Бақылау' }]
      : []),
    ...(user.role === 'ADMIN'
      ? [{ href: '/dashboard/admin', icon: '⚙️', label: 'Админ панелі', desc: 'Жүйе' }]
      : []),
  ];

  return (
    <div className="space-y-8">
      {/* ─── Hero / Welcome banner ─── */}
      <div className={`relative bg-gradient-to-r ${grad} rounded-2xl p-8 text-white overflow-hidden`}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white blur-3xl transform translate-x-16 -translate-y-16" />
        </div>
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl font-extrabold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1">
            <p className="text-white/70 text-sm mb-1">Қош келдіңіз!</p>
            <h1 className="text-2xl font-extrabold">{user.name}</h1>
            <p className="text-white/80 text-sm mt-1">{user.email}</p>
          </div>
          <div className="flex-shrink-0">
            <Link
              href="/dashboard/profile"
              className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Профиль →
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Stats row ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Белсенді курс', value: String(activeEnrollments.length), icon: '📚', color: 'text-primary-600' },
          { label: 'Емтихан', value: String(attempts), icon: '📝', color: 'text-blue-600' },
          { label: 'Сертификат', value: String(certs), icon: '🏆', color: 'text-yellow-600' },
          { label: 'Деңгей', value: { STUDENT: 'Студент', TEACHER: 'Мұғалім', PROCTOR: 'Проктор', ADMIN: 'Админ' }[user.role] ?? user.role, icon: '⭐', color: 'text-purple-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4 shadow-sm">
            <span className="text-3xl">{s.icon}</span>
            <div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Continue learning ─── */}
      {activeEnrollments.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-3">Оқуды жалғастыру</h2>
          <div className="flex flex-col gap-3">
            {activeEnrollments.slice(0, 3).map(enrollment => (
              <div key={enrollment.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${LEVEL_COLOR[enrollment.course.level] ?? 'bg-gray-100 text-gray-600'} mb-2 inline-block`}>
                      {enrollment.course.level === 'BEGINNER' ? '🟢 Бастаушы' : enrollment.course.level === 'INTERMEDIATE' ? '🟡 Орта' : '🔴 Жоғары'}
                    </span>
                    <h3 className="text-base font-bold text-gray-900 mb-1">{enrollment.course.title}</h3>
                    <p className="text-sm text-gray-500 mb-3">{enrollment.completedLessons ?? 0} / {enrollment.totalLessons ?? '?'} сабақ аяқталды</p>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all"
                        style={{ width: `${Math.min(enrollment.progress ?? 0, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400">{enrollment.progress ?? 0}% аяқталды</p>
                  </div>
                  <Link
                    href={`/dashboard/courses/${enrollment.course.id}`}
                    className="bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors flex-shrink-0 text-center"
                  >
                    Жалғастыру →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeEnrollments.length === 0 && (
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 border border-primary-100 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <span className="text-4xl">🎯</span>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900">Оқуды бастаңыз!</h3>
            <p className="text-sm text-gray-500 mt-0.5">Деңгейіңізге сай курс таңдаңыз және бастаңыз.</p>
          </div>
          <Link
            href="/dashboard/courses"
            className="bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors flex-shrink-0"
          >
            Курс таңдау →
          </Link>
        </div>
      )}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-3">Жылдам өту</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-white rounded-2xl border border-gray-200 hover:border-primary-300 hover:shadow-md transition-all p-5 flex items-center gap-4 group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary-50 group-hover:bg-primary-100 flex items-center justify-center text-2xl transition-colors flex-shrink-0">
                {link.icon}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm group-hover:text-primary-700 transition-colors">{link.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{link.desc}</p>
              </div>
              <span className="ml-auto text-gray-300 group-hover:text-primary-400 text-lg transition-colors">→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
