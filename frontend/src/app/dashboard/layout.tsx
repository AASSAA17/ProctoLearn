'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import Link from 'next/link';
import { NavIcon } from '@/components/nav-icon';
import { Spinner } from '@/components/ui';
import ChatWidget from '@/components/ai/ChatWidget';
import toast from 'react-hot-toast';
import { canVisitDashboardPath, dashboardLinks } from '@/lib/role-navigation';
import './dashboard.css';

const ROLE_LABEL: Record<string, string> = {
  STUDENT: 'Студент', TEACHER: 'Мұғалім', PROCTOR: 'Проктор', ADMIN: 'Админ',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, fetchMe, logout, isLoading, initialized, error } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void fetchMe();
    const retry = () => { if (document.visibilityState === 'visible') void fetchMe(); };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => { window.removeEventListener('online', retry); document.removeEventListener('visibilitychange', retry); };
  }, [fetchMe]);

  useEffect(() => {
    if (initialized && !isLoading && !user && !error) router.replace('/auth/login');
  }, [user, isLoading, initialized, error, router]);

  useEffect(() => {
    if (menuOpen) drawer.current?.showModal();
    else drawer.current?.close();
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const media = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (media.matches) setMenuOpen(false); };
    media.addEventListener('change', closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      media.removeEventListener('change', closeOnDesktop);
    };
  }, [menuOpen]);

  if (!initialized || (!user && isLoading)) {
    return <div className="workspace-loading" role="status"><Spinner size="lg" /><p>Жұмыс кеңістігі жүктелуде...</p></div>;
  }
  if (!user) return error ? <div className="workspace-loading"><div className="card space-y-4 max-w-md"><p role="alert">{error}</p><button className="btn-primary" onClick={() => void fetchMe()}>Қайта тексеру</button><Link className="block text-primary-700" href="/auth/login">Кіру беті</Link></div></div> : null;
  if (!canVisitDashboardPath(user.role, pathname)) {
    return <div className="workspace-loading"><div role="alert" className="card max-w-lg"><p className="font-semibold">Бұл бөлім сіздің рөліңізге қолжетімсіз.</p><Link href="/dashboard" className="mt-4 inline-block text-primary-700 underline">Өз панеліңізге қайту</Link></div></div>;
  }
  // Exam sessions retain their distraction-free shell and all existing controls.
  if (pathname.startsWith('/dashboard/exam/')) return <>{children}</>;

  const handleLogout = async () => {
    try { await logout(); router.replace('/auth/login'); }
    catch { toast.error('Серверден шығу расталмады. Байланысты тексеріп, қайта көріңіз.'); }
  };
  const navLinks = dashboardLinks(user.role);
  const isActive = (link: { href: string; exact: boolean }) => link.exact ? pathname === link.href : pathname.startsWith(link.href);
  const currentPage = pathname === '/dashboard/profile' ? 'Профиль'
    : pathname === '/dashboard/change-password' ? 'Парольді өзгерту'
    : [...navLinks].reverse().find(isActive)?.label ?? 'Жұмыс кеңістігі';
  const initials = user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  const closeDrawer = () => setMenuOpen(false);

  const navigation = <>
    <Link href="/dashboard" onClick={closeDrawer} className="workspace-brand" aria-label="ProctoLearn — басты бет">
      <span className="workspace-brand-mark" aria-hidden="true"><NavIcon icon="🎓" className="h-6 w-6" /></span>
      <span>Procto<span className="text-violet-600">Learn</span></span>
    </Link>
    <p className="workspace-nav-caption">Жұмыс кеңістігі</p>
    <nav aria-label="Негізгі навигация" className="workspace-nav">
      {navLinks.map((link) => <Link key={link.href} href={link.href} onClick={closeDrawer} aria-current={isActive(link) ? 'page' : undefined} className="workspace-nav-link">
        <NavIcon icon={link.icon} className="h-5 w-5 shrink-0" /><span>{link.label}</span>
      </Link>)}
    </nav>
    <div className="workspace-account">
      <Link href="/dashboard/profile" onClick={closeDrawer} className="workspace-user">
        <span className="workspace-avatar">{initials}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{user.name}</span><span className="block text-xs text-slate-500">{ROLE_LABEL[user.role] ?? user.role}</span></span>
      </Link>
      <Link href="/dashboard/change-password" onClick={closeDrawer} className="workspace-nav-link"><NavIcon icon="🔑" className="h-4 w-4" />Парольді өзгерту</Link>
      <button type="button" onClick={handleLogout} className="workspace-nav-link workspace-logout"><NavIcon icon="🚪" className="h-4 w-4" />Шығу</button>
    </div>
  </>;

  return <div className="workspace-shell">
    <a href="#main-content" className="workspace-skip">Негізгі мазмұнға өту</a>
    <aside className="workspace-sidebar">{navigation}</aside>
    <dialog ref={drawer} id="workspace-mobile-menu" aria-label="Жұмыс кеңістігінің мәзірі" className="workspace-drawer" onCancel={closeDrawer} onClose={() => { closeDrawer(); menuButton.current?.focus(); }} onClick={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}>
      <div className="workspace-drawer-content">
        <button type="button" onClick={closeDrawer} className="workspace-icon-button self-end" aria-label="Мәзірді жабу">✕</button>
        {navigation}
      </div>
    </dialog>
    <div className="workspace-body">
      {error && <div role="alert" className="workspace-banner">{error}<button className="ml-3 underline" onClick={() => void fetchMe()}>Қайта тексеру</button></div>}
      {user.mustChangePassword && <div className="workspace-banner">Парольді өзгерту қажет. <Link href="/dashboard/change-password" className="font-semibold underline">Өзгерту →</Link></div>}
      <header className="workspace-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <button ref={menuButton} type="button" className="workspace-icon-button lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Мәзірді ашу" aria-expanded={menuOpen} aria-controls="workspace-mobile-menu">
            <svg className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth="1.8" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <nav aria-label="Бет жолы" className="flex min-w-0 items-center gap-2 text-sm"><Link href="/dashboard" className="hidden text-slate-500 sm:inline">Жұмыс кеңістігі</Link><span aria-hidden="true" className="hidden text-slate-300 sm:inline">/</span><span aria-current="page" className="truncate font-semibold text-slate-900">{currentPage}</span></nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/dashboard/notifications" className="workspace-icon-button" aria-label="Хабарландырулар"><NavIcon icon="🔔" className="h-5 w-5" /></Link>
          <Link href="/dashboard/profile" className="workspace-avatar" aria-label={`Профиль: ${user.name}`}>{initials}</Link>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="workspace-content">{children}</main>
    </div>
    {user.role === 'STUDENT' && <ChatWidget />}
  </div>;
}
