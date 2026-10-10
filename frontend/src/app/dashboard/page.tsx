'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore, type User } from '@/store/auth.store';
import Link from 'next/link';
import api from '@/lib/api';
import LoadFailure from '@/components/LoadFailure';
import { staffHomeFor } from '@/lib/role-navigation';
import { NavIcon } from '@/components/nav-icon';

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

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  if (user.role !== 'STUDENT') return <StaffDashboard user={user} />;
  return <StudentDashboard user={user} />;
}

function StaffDashboard({ user }: { user: User }) {
  if (user.role === 'STUDENT') return null;
  return <div className="space-y-6">
    <div className="workspace-welcome">
      <p className="workspace-eyebrow">Сіздің жұмыс кеңістігіңіз</p>
      <h1 className="mt-1 text-2xl font-bold text-gray-900">{user.name}</h1>
      <p className="mt-2 text-sm text-gray-600">Жұмысты өз рөліңіздің бөлімінен бастаңыз.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {staffHomeFor(user.role).map((item, index) => <Link key={item.href} href={item.href} className="group rounded-2xl border border-gray-200 bg-white p-7 shadow-sm transition hover:border-violet-300 hover:shadow-md">
        <span aria-hidden="true" className="mb-6 grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-violet-700"><NavIcon icon={item.href.includes('proctor') ? '🔍' : item.href.includes('teacher') ? '🎓' : '⚙️'} /></span>
        <p className="workspace-eyebrow">0{index + 1}</p>
        <h2 className="font-semibold text-gray-900">{item.title}</h2>
        <p className="mt-2 text-sm text-gray-600">{item.description}</p>
        <span className="mt-4 inline-block text-sm font-medium text-primary-700">Ашу →</span>
      </Link>)}
    </div>
  </div>;
}

function StudentDashboard({ user }: { user: User }) {
  const [activeEnrollments, setActiveEnrollments] = useState<Enrollment[]>([]);
  const [attempts, setAttempts] = useState<number>(0);
  const [certs, setCerts] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const [enrollments, attemptsResponse, certificates] = await Promise.all([
        api.get('/enrollments/my'), api.get('/attempts/my'), api.get('/certificates/my'),
      ]);
      const all: Enrollment[] = Array.isArray(enrollments.data) ? enrollments.data : [];
      setActiveEnrollments(all.filter(e => !e.completedAt));
      setAttempts(Array.isArray(attemptsResponse.data) ? attemptsResponse.data.length : 0);
      setCerts(Array.isArray(certificates.data) ? certificates.data.length : 0);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const retry = () => {
    setLoading(true);
    void loadDashboard();
  };

  if (loading) return <div role="status" className="py-16 text-center text-gray-500">Жүктелуде...</div>;
  if (loadError) return <LoadFailure onRetry={retry} />;

  const initials = user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  const quickLinks = [
    { href: '/dashboard/courses', icon: '📚', label: 'Курстарды қарау', desc: 'Барлық курстар' },
    { href: '/dashboard/my-attempts', icon: '📊', label: 'Нәтижелерім', desc: `${attempts} емтихан` },
    { href: '/dashboard/certificates', icon: '🏆', label: 'Сертификаттар', desc: `${certs} сертификат` },
  ];

  return (
    <div className="space-y-8">
      {/* ─── Hero / Welcome banner ─── */}
      <div className="workspace-welcome">
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center text-2xl font-extrabold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1">
            <p className="workspace-eyebrow">Қош келдіңіз!</p>
            <h1 className="text-2xl font-extrabold">{user.name}</h1>
            <p className="text-slate-500 text-sm mt-2">Оқу жолыңыз осы жерден жалғасады.</p>
          </div>
          <div className="flex-shrink-0">
            <Link
              href="/dashboard/profile"
              className="btn-secondary"
            >
              Профиль →
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Stats row ─── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Белсенді курс', value: String(activeEnrollments.length), icon: '📚', color: 'text-primary-600' },
          { label: 'Емтихан', value: String(attempts), icon: '📊', color: 'text-blue-600' },
          { label: 'Сертификат', value: String(certs), icon: '🏆', color: 'text-yellow-600' },
          { label: 'Рөл', value: { STUDENT: 'Студент', TEACHER: 'Мұғалім', PROCTOR: 'Проктор', ADMIN: 'Админ' }[user.role] ?? user.role, icon: '👤', color: 'text-purple-600' },
        ].map((s) => (
          <div key={s.label} className="workspace-stat">
            <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">{s.label}</p><span className={s.color}><NavIcon icon={s.icon} className="h-5 w-5" /></span></div>
            <p className="workspace-stat-value text-slate-900">{s.value}</p>
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
                    <div role="progressbar" aria-label={`${enrollment.course.title}: оқу барысы`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(enrollment.progress ?? 0, 100))} className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                      <div
                        className="h-full bg-primary-500 rounded-full transition-all"
                        style={{ width: `${Math.max(0, Math.min(enrollment.progress ?? 0, 100))}%` }}
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
                <NavIcon icon={link.icon} className="h-6 w-6 text-violet-700" />
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
