'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import Link from 'next/link';
import { NavIcon } from '@/components/nav-icon';
import { Spinner } from '@/components/ui';
import ChatWidget from '@/components/ai/ChatWidget';

const ROLE_LABEL: Record<string, string> = {
  STUDENT: 'Студент',
  TEACHER: 'Мұғалім',
  PROCTOR: 'Проктор',
  ADMIN: 'Админ',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, fetchMe, logout, isLoading, _hasHydrated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    // Validate token in background; user is already restored from localStorage by persist
    fetchMe();
  }, []);

  useEffect(() => {
    // Only redirect after hydration is complete and there is no user
    if (_hasHydrated && !isLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isLoading, _hasHydrated]);

  // Show spinner until persist has rehydrated from localStorage
  if (!_hasHydrated || (!user && isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Spinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Жүктелуде...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // Exam mode: hide entire shell, render only the exam page
  if (pathname.startsWith('/dashboard/exam/')) {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    setProfileOpen(false);
    await logout();
    router.push('/auth/login');
  };

  const navLinks = [
    { href: '/dashboard', label: 'Басты бет', icon: '🏠', exact: true },
    { href: '/dashboard/courses', label: 'Курстар', icon: '📚', exact: false },
    { href: '/dashboard/my-attempts', label: 'Нәтижелер', icon: '📊', exact: false },
    { href: '/dashboard/certificates', label: 'Сертификаттар', icon: '🏆', exact: false },
    ...(user.role === 'TEACHER' || user.role === 'ADMIN'
      ? [
          { href: '/dashboard/teacher/courses', label: 'Мұғалім', icon: '🎓', exact: false },
        ]
      : []),
    ...(user.role === 'PROCTOR' || user.role === 'ADMIN'
      ? [{ href: '/dashboard/proctor', label: 'Проктор', icon: '🔍', exact: false }]
      : []),
    ...(user.role === 'ADMIN'
      ? [{ href: '/dashboard/admin', label: 'Админ', icon: '⚙️', exact: false }]
      : []),
  ];

  const isActive = (link: { href: string; exact: boolean }) =>
    link.exact ? pathname === link.href : pathname.startsWith(link.href);

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Password change banner */}
      {user.mustChangePassword && (
        <div className="bg-amber-500 text-white text-sm text-center py-2 px-4 font-medium">
          ⚠️ Парольді өзгерту қажет.{' '}
          <Link href="/dashboard/change-password" className="underline font-bold">Өзгерту →</Link>
        </div>
      )}

      {/* ─── Top Navbar ─── */}
      <nav className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="flex items-center gap-1 flex-shrink-0">
                <span className="text-xl font-extrabold text-primary-700">Procto</span>
                <span className="text-xl font-extrabold text-gray-800">Learn</span>
              </Link>

              {/* Desktop nav links */}
              <div className="hidden md:flex items-center gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-label={link.label}
                    aria-current={isActive(link) ? 'page' : undefined}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive(link)
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <NavIcon icon={link.icon} className="w-4.5 h-4.5" />
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* User avatar dropdown */}
              <div className="relative">
                <button
                  onClick={() => setProfileOpen((v) => !v)}
                  aria-label="Профиль мәзірі"
                  aria-expanded={profileOpen}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {initials}
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-semibold text-gray-900 leading-tight">{user.name}</p>
                    <p className="text-xs text-gray-400 leading-tight">{ROLE_LABEL[user.role] ?? user.role}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown */}
                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>
                      <Link
                        href="/dashboard/profile"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <NavIcon icon="👤" className="w-4 h-4" /> Профиль
                      </Link>
                      <Link
                        href="/dashboard/change-password"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <NavIcon icon="🔑" className="w-4 h-4" /> Парольді өзгерту
                      </Link>
                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <button
                          onClick={handleLogout}
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <NavIcon icon="🚪" className="w-4 h-4" /> Шығу
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Mobile hamburger */}
              <button
                className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Мәзірді ашу"
                aria-expanded={menuOpen}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 pb-3 pt-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                aria-label={link.label}
                aria-current={isActive(link) ? 'page' : undefined}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors ${
                  isActive(link)
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <NavIcon icon={link.icon} className="w-5 h-5" />
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
      <ChatWidget />
    </div>
  );
}
