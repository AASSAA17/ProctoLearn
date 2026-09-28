export type DashboardRole = 'STUDENT' | 'TEACHER' | 'PROCTOR' | 'ADMIN';

export const staffHome: Record<Exclude<DashboardRole, 'STUDENT'>, { href: string; title: string; description: string }[]> = {
  TEACHER: [{ href: '/dashboard/teacher/courses', title: 'Менің курстарым', description: 'Курстарды, сабақтарды және емтихандарды басқару' }],
  PROCTOR: [{ href: '/dashboard/proctor', title: 'Проктор панелі', description: 'Тапсырылған сессияларды бақылау және тексеру' }],
  ADMIN: [
    { href: '/dashboard/admin', title: 'Админ панелі', description: 'Жүйе статистикасы мен басқару' },
    { href: '/dashboard/teacher/courses', title: 'Курстарды басқару', description: 'Курс мазмұны мен емтихандар' },
    { href: '/dashboard/proctor', title: 'Проктор панелі', description: 'Сессиялар мен дәлелдерді тексеру' },
  ],
};

export function dashboardLinks(role: DashboardRole) {
  const common = [
    { href: '/dashboard', label: 'Басты бет', icon: '🏠', exact: true },
    { href: '/dashboard/notifications', label: 'Хабарландырулар', icon: '🔔', exact: false },
  ];
  if (role === 'STUDENT') return [
    common[0],
    { href: '/dashboard/courses', label: 'Курстар', icon: '📚', exact: false },
    { href: '/dashboard/my-attempts', label: 'Нәтижелер', icon: '📊', exact: false },
    { href: '/dashboard/certificates', label: 'Сертификаттар', icon: '🏆', exact: false },
    common[1],
  ];
  return [
    ...common,
    ...(role === 'TEACHER' || role === 'ADMIN' ? [{ href: '/dashboard/teacher/courses', label: role === 'ADMIN' ? 'Курстарды басқару' : 'Менің курстарым', icon: '🎓', exact: false }] : []),
    ...(role === 'PROCTOR' || role === 'ADMIN' ? [{ href: '/dashboard/proctor', label: 'Проктор', icon: '🔍', exact: false }] : []),
    ...(role === 'ADMIN' ? [{ href: '/dashboard/admin', label: 'Админ', icon: '⚙️', exact: false }] : []),
  ];
}

export function studentOnlyPath(pathname: string) {
  return pathname === '/dashboard/courses' || pathname.startsWith('/dashboard/courses/') ||
    pathname === '/dashboard/my-attempts' || pathname.startsWith('/dashboard/my-attempts/') ||
    pathname === '/dashboard/certificates' || pathname.startsWith('/dashboard/exam/');
}

export function canVisitDashboardPath(role: DashboardRole, pathname: string) {
  if (studentOnlyPath(pathname)) return role === 'STUDENT';
  if (pathname === '/dashboard/teacher' || pathname.startsWith('/dashboard/teacher/')) return role === 'TEACHER' || role === 'ADMIN';
  if (pathname === '/dashboard/proctor' || pathname.startsWith('/dashboard/proctor/')) return role === 'PROCTOR' || role === 'ADMIN';
  if (pathname === '/dashboard/admin' || pathname.startsWith('/dashboard/admin/')) return role === 'ADMIN';
  return true;
}
