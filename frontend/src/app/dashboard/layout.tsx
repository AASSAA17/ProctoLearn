'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, fetchMe, logout, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    fetchMe();
  }, []);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isLoading]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Жүктелуде...</p>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  const navLinks = [
    { href: '/dashboard', label: 'Басты бет' },
    { href: '/dashboard/courses', label: 'Курстар' },
    { href: '/dashboard/my-attempts', label: 'Менің нәтижелерім' },
    { href: '/dashboard/certificates', label: 'Сертификаттар' },
    ...(user.role === 'TEACHER' || user.role === 'ADMIN'
      ? [{ href: '/dashboard/teacher', label: 'Мұғалім панелі' }]
      : []),
    ...(user.role === 'PROCTOR' || user.role === 'ADMIN'
      ? [{ href: '/dashboard/proctor', label: 'Проктор панелі' }]
      : []),
    ...(user.role === 'ADMIN'
      ? [{ href: '/dashboard/admin', label: '⚙ Админ панелі' }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {user.mustChangePassword && (
        <div className="bg-yellow-500 text-white text-sm text-center py-2 px-4">
          ⚠️ Администратор парольды жаңартты.{' '}
          <Link href="/dashboard/change-password" className="underline font-semibold">Парольді өзгертіңіз →</Link>
        </div>
      )}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-xl font-bold text-primary-700">
                ProctoLearn
              </Link>
              <div className="hidden md:flex gap-4">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-gray-600 hover:text-primary-600 text-sm font-medium transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user.name}</p>
                <Link href="/dashboard/change-password" className="text-xs text-gray-400 hover:text-blue-600">
                  🔑 Пароль
                </Link>
              </div>
              <button
                onClick={handleLogout}
                className="text-sm text-red-600 hover:text-red-800 font-medium"
              >
                Шығу
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
