'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuthStore, type User } from '@/store/auth.store';
import { staffHomeFor } from '@/lib/role-navigation';
import { NavIcon } from '@/components/nav-icon';
import {
  certificateJourneyStage,
  continueLearningHref,
  loadDashboardList,
  type CertificateJourneyStage,
  type DashboardAttempt,
  type DashboardCertificate,
  type DashboardEnrollment,
  type DashboardResource,
} from './dashboard-data';

const LEVEL_COLOR: Record<string, string> = {
  BEGINNER: 'bg-green-100 text-green-700',
  INTERMEDIATE: 'bg-yellow-100 text-yellow-700',
  ADVANCED: 'bg-red-100 text-red-700',
};

const JOURNEY_COPY: Record<CertificateJourneyStage, { title: string; detail: string; tone: string }> = {
  learning: { title: 'Оқу жалғасуда', detail: 'Аяқталмаған сабақтар мен практикалық тапсырмаларды орындаңыз.', tone: 'border-violet-200 bg-violet-50 text-violet-900' },
  'exam-requirements': { title: 'Емтихан талаптарын тексеріңіз', detail: 'Сабақ прогресі 100%. Нақты емтихан талаптары курс бетінде тексеріледі.', tone: 'border-blue-200 bg-blue-50 text-blue-900' },
  'exam-in-progress': { title: 'Емтихан жүріп жатыр', detail: 'Басталған емтиханды қауіпсіз жалғастырыңыз.', tone: 'border-blue-200 bg-blue-50 text-blue-900' },
  'exam-not-passed': { title: 'Өту балы жиналмады', detail: 'Нәтижені қарап, келесі рұқсат етілген әрекетті курс бетінен тексеріңіз.', tone: 'border-rose-200 bg-rose-50 text-rose-900' },
  'review-pending': { title: 'Тексеру күтілуде', detail: 'Емтихан жіберілді. Сертификат тек тексеру аяқталғаннан кейін беріледі.', tone: 'border-amber-200 bg-amber-50 text-amber-900' },
  'review-rejected': { title: 'Тексеру қабылданбады', detail: 'Себеп пен қолжетімді апелляция әрекеттерін нәтиже бетінен қараңыз.', tone: 'border-rose-200 bg-rose-50 text-rose-900' },
  'certificate-not-issued': { title: 'Сертификат әлі берілмеді', detail: 'Сертификат жазбасы әзірге қолжетімді емес. Толық нәтижені және қажетті тексерулерді қараңыз.', tone: 'border-amber-200 bg-amber-50 text-amber-900' },
  'exam-status-unknown': { title: 'Емтихан күйін тексеріңіз', detail: 'Толық күй мен келесі рұқсат етілген әрекетті нәтижелер бөлімінен қараңыз.', tone: 'border-slate-200 bg-slate-50 text-slate-900' },
  'certificate-valid': { title: 'Сертификат қолжетімді', detail: 'PDF файлын жүктеп, QR арқылы ашық тексеру бетін қолдана аласыз.', tone: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  'certificate-revoked': { title: 'Сертификаттың күші жойылған', detail: 'Сертификат бетінде оның қазіргі күйін және QR тексеру нәтижесін қараңыз.', tone: 'border-rose-200 bg-rose-50 text-rose-900' },
};

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
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
  const [enrollments, setEnrollments] = useState<DashboardResource<DashboardEnrollment[]>>({ status: 'loading', data: null });
  const [attempts, setAttempts] = useState<DashboardResource<DashboardAttempt[]>>({ status: 'loading', data: null });
  const [certificates, setCertificates] = useState<DashboardResource<DashboardCertificate[]>>({ status: 'loading', data: null });
  const enrollmentRequest = useRef(0);
  const attemptRequest = useRef(0);
  const certificateRequest = useRef(0);

  const loadEnrollments = useCallback(async () => {
    const request = ++enrollmentRequest.current;
    setEnrollments({ status: 'loading', data: null });
    const result = await loadDashboardList<DashboardEnrollment>(() => api.get('/enrollments/my'));
    if (request === enrollmentRequest.current) setEnrollments(result);
  }, []);

  const loadAttempts = useCallback(async () => {
    const request = ++attemptRequest.current;
    setAttempts({ status: 'loading', data: null });
    const result = await loadDashboardList<DashboardAttempt>(() => api.get('/attempts/my'));
    if (request === attemptRequest.current) setAttempts(result);
  }, []);

  const loadCertificates = useCallback(async () => {
    const request = ++certificateRequest.current;
    setCertificates({ status: 'loading', data: null });
    const result = await loadDashboardList<DashboardCertificate>(() => api.get('/certificates/my'));
    if (request === certificateRequest.current) setCertificates(result);
  }, []);

  useEffect(() => {
    void loadEnrollments();
    void loadAttempts();
    void loadCertificates();
    return () => {
      enrollmentRequest.current += 1;
      attemptRequest.current += 1;
      certificateRequest.current += 1;
    };
  }, [loadAttempts, loadCertificates, loadEnrollments]);

  const enrollmentItems = enrollments.status === 'success' ? enrollments.data : [];
  const activeEnrollments = enrollmentItems.filter((item) => !item.completedAt);
  const primaryEnrollment = activeEnrollments.find((item) => item.progress < 100) ?? activeEnrollments[0] ?? null;
  const initials = user.name.split(' ').map((name) => name[0]).slice(0, 2).join('').toUpperCase();
  const attemptsDescription = attempts.status === 'success' ? `${attempts.data.length} емтихан` : attempts.status === 'loading' ? 'Жүктелуде' : 'Күйі белгісіз';
  const certificatesDescription = certificates.status === 'success' ? `${certificates.data.length} сертификат` : certificates.status === 'loading' ? 'Жүктелуде' : 'Күйі белгісіз';

  return (
    <div className="space-y-8">
      <div className="workspace-welcome">
        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-2xl font-extrabold text-violet-700">{initials}</div>
          <div className="flex-1">
            <p className="workspace-eyebrow">Қош келдіңіз!</p>
            <h1 className="text-2xl font-extrabold">{user.name}</h1>
            <p className="mt-2 text-sm text-slate-500">Оқу жолыңыз осы жерден жалғасады.</p>
          </div>
          {primaryEnrollment ? <Link href={continueLearningHref(primaryEnrollment)} className="btn-primary">Оқуды жалғастыру →</Link> : <Link href="/dashboard/profile" className="btn-secondary">Профиль →</Link>}
        </div>
      </div>

      <section aria-labelledby="dashboard-summary-title">
        <h2 id="dashboard-summary-title" className="sr-only">Оқу көрсеткіштері</h2>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <ResourceStat label="Белсенді курс" icon="📚" color="text-primary-600" resource={enrollments} value={String(activeEnrollments.length)} onRetry={loadEnrollments} />
          <ResourceStat label="Емтихан" icon="📊" color="text-blue-600" resource={attempts} value={attempts.status === 'success' ? String(attempts.data.length) : ''} onRetry={loadAttempts} />
          <ResourceStat label="Сертификат" icon="🏆" color="text-yellow-600" resource={certificates} value={certificates.status === 'success' ? String(certificates.data.length) : ''} onRetry={loadCertificates} />
          <div className="workspace-stat">
            <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">Рөл</p><span className="text-purple-600"><NavIcon icon="👤" className="h-5 w-5" /></span></div>
            <p className="workspace-stat-value text-slate-900">Студент</p>
          </div>
        </div>
      </section>

      <ContinueLearning resource={enrollments} onRetry={loadEnrollments} />
      <CertificateJourney enrollments={enrollments} attempts={attempts} certificates={certificates} retryAttempts={loadAttempts} retryCertificates={loadCertificates} />

      <section aria-labelledby="quick-links-title">
        <h2 id="quick-links-title" className="mb-3 text-lg font-bold text-gray-900">Жылдам өту</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: '/dashboard/courses', icon: '📚', label: 'Курстарды қарау', desc: 'Барлық курстар' },
            { href: '/dashboard/my-attempts', icon: '📊', label: 'Нәтижелерім', desc: attemptsDescription },
            { href: '/dashboard/certificates', icon: '🏆', label: 'Сертификаттар', desc: certificatesDescription },
          ].map((link) => <Link key={link.href} href={link.href} className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-primary-300 hover:shadow-md">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-2xl transition-colors group-hover:bg-primary-100"><NavIcon icon={link.icon} className="h-6 w-6 text-violet-700" /></div>
            <div><p className="text-sm font-semibold text-gray-900 transition-colors group-hover:text-primary-700">{link.label}</p><p className="mt-0.5 text-xs text-gray-500">{link.desc}</p></div>
            <span aria-hidden="true" className="ml-auto text-lg text-gray-300 transition-colors group-hover:text-primary-400">→</span>
          </Link>)}
        </div>
      </section>
    </div>
  );
}

function ResourceStat<T>({ label, icon, color, resource, value, onRetry }: { label: string; icon: string; color: string; resource: DashboardResource<T>; value: string; onRetry: () => Promise<void> }) {
  return <div className="workspace-stat">
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">{label}</p><span className={color}><NavIcon icon={icon} className="h-5 w-5" /></span></div>
    {resource.status === 'loading' && <p role="status" className="mt-3 text-sm font-semibold text-slate-500">Жүктелуде...</p>}
    {resource.status === 'success' && <p className="workspace-stat-value text-slate-900">{value}</p>}
    {resource.status === 'error' && <div className="mt-3"><p className="font-semibold text-slate-700">Күйі белгісіз</p><button type="button" onClick={() => void onRetry()} className="mt-2 min-h-11 text-sm font-semibold text-primary-700 underline underline-offset-4">Қайта көру</button></div>}
  </div>;
}

function ContinueLearning({ resource, onRetry }: { resource: DashboardResource<DashboardEnrollment[]>; onRetry: () => Promise<void> }) {
  if (resource.status === 'loading') return <section aria-labelledby="continue-title"><h2 id="continue-title" className="mb-3 text-lg font-bold text-gray-900">Оқуды жалғастыру</h2><div role="status" className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-slate-500">Курстар жүктелуде...</div></section>;
  if (resource.status === 'error') return <SectionFailure title="Оқуды жалғастыру" message="Курс деректерін жүктеу мүмкін болмады. Басқа бөлімдер қолжетімді күйінде қалады." onRetry={onRetry} />;
  const active = resource.data.filter((item) => !item.completedAt);
  if (active.length === 0) return <section aria-labelledby="continue-title" className="flex flex-col items-start gap-4 rounded-2xl border border-primary-100 bg-gradient-to-r from-primary-50 to-blue-50 p-6 sm:flex-row sm:items-center"><span aria-hidden="true" className="text-4xl">🎯</span><div className="flex-1"><h2 id="continue-title" className="font-bold text-gray-900">Оқуды бастаңыз!</h2><p className="mt-0.5 text-sm text-gray-600">Деңгейіңізге сай курс таңдаңыз және бастаңыз.</p></div><Link href="/dashboard/courses" className="btn-primary">Курс таңдау →</Link></section>;
  const ordered = [...active].sort((left, right) => Number(left.progress >= 100) - Number(right.progress >= 100));
  return <section aria-labelledby="continue-title">
    <h2 id="continue-title" className="mb-3 text-lg font-bold text-gray-900">Оқуды жалғастыру</h2>
    <div className="flex flex-col gap-3">
      {ordered.slice(0, 3).map((enrollment, index) => {
        const progress = Math.max(0, Math.min(enrollment.progress, 100));
        return <article key={enrollment.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${index === 0 ? 'border-violet-300 ring-1 ring-violet-100' : 'border-gray-200'}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <span className={`mb-2 inline-block rounded-full px-2 py-1 text-xs font-semibold ${LEVEL_COLOR[enrollment.course.level] ?? 'bg-gray-100 text-gray-600'}`}>{enrollment.course.level === 'BEGINNER' ? 'Бастаушы' : enrollment.course.level === 'INTERMEDIATE' ? 'Орта' : 'Жоғары'}</span>
              <h3 className="mb-1 text-base font-bold text-gray-900">{enrollment.course.title}</h3>
              <p className="mb-3 text-sm text-gray-600">{enrollment.completedLessons} / {enrollment.totalLessons} сабақ аяқталды</p>
              <div role="progressbar" aria-label={`${enrollment.course.title}: оқу барысы`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="mb-1 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${progress}%` }} /></div>
              <p className="text-xs text-gray-500">{progress}% аяқталды</p>
            </div>
            <Link href={continueLearningHref(enrollment)} className={index === 0 ? 'btn-primary text-center' : 'btn-secondary text-center'}>{progress >= 100 ? 'Курсқа өту →' : 'Жалғастыру →'}</Link>
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function CertificateJourney({ enrollments, attempts, certificates, retryAttempts, retryCertificates }: { enrollments: DashboardResource<DashboardEnrollment[]>; attempts: DashboardResource<DashboardAttempt[]>; certificates: DashboardResource<DashboardCertificate[]>; retryAttempts: () => Promise<void>; retryCertificates: () => Promise<void> }) {
  if (enrollments.status !== 'success' || enrollments.data.length === 0) return null;
  const dependenciesReady = attempts.status === 'success' && certificates.status === 'success';
  return <section aria-labelledby="certificate-journey-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="workspace-eyebrow">Келесі қадам</p><h2 id="certificate-journey-title" className="text-lg font-bold text-gray-900">Сертификатқа дейінгі жол</h2></div><Link href="/dashboard/certificates" className="text-sm font-semibold text-primary-700 underline underline-offset-4">Сертификаттарымды ашу</Link></div>
    <ol aria-label="Сертификат алу кезеңдері" className="mt-5 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-3 lg:grid-cols-6">
      {['Оқу', 'Практика', 'Емтихан талабы', 'Емтихан', 'Тексеру', 'Сертификат және QR'].map((label, index) => <li key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"><span className="mr-1 font-bold text-violet-700">{index + 1}.</span>{label}</li>)}
    </ol>
    {(attempts.status === 'error' || certificates.status === 'error') && <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">Сертификат жолының толық күйі белгісіз.</p><p className="mt-1">Жүктелген курс деректері сақталды. Қате бөлімді бөлек қайталап көріңіз.</p><div className="mt-3 flex flex-wrap gap-3">{attempts.status === 'error' && <button type="button" onClick={() => void retryAttempts()} className="min-h-11 font-semibold underline underline-offset-4">Емтихан күйін қайталау</button>}{certificates.status === 'error' && <button type="button" onClick={() => void retryCertificates()} className="min-h-11 font-semibold underline underline-offset-4">Сертификат күйін қайталау</button>}</div></div>}
    <div className="mt-5 space-y-3">
      {enrollments.data.slice(0, 3).map((enrollment) => {
        if (!dependenciesReady) return <div key={enrollment.id} className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold text-slate-900">{enrollment.course.title}</h3><p role={attempts.status === 'loading' || certificates.status === 'loading' ? 'status' : undefined} className="mt-2 text-sm text-slate-600">{attempts.status === 'loading' || certificates.status === 'loading' ? 'Емтихан және сертификат күйі жүктелуде...' : 'Толық күйді көрсету үшін қате бөлімді қайта жүктеңіз.'}</p></div>;
        const stage = certificateJourneyStage(enrollment, attempts.data, certificates.data);
        const copy = JOURNEY_COPY[stage];
        const attempt = attempts.data.find((item) => item.exam.courseId === enrollment.courseId);
        const href = stage === 'certificate-valid' || stage === 'certificate-revoked' ? '/dashboard/certificates' : stage === 'exam-in-progress' && attempt ? `/dashboard/exam/${encodeURIComponent(attempt.exam.id)}` : (stage === 'review-pending' || stage === 'review-rejected' || stage === 'exam-not-passed') && attempt ? `/dashboard/my-attempts/${encodeURIComponent(attempt.id)}` : continueLearningHref(enrollment);
        return <article key={enrollment.id} className={`rounded-xl border p-4 ${copy.tone}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">{enrollment.course.title}</h3><p className="mt-1 text-sm font-semibold">{copy.title}</p><p className="mt-1 text-sm opacity-80">{copy.detail}</p></div><Link href={href} className="min-h-11 self-start rounded-xl border border-current px-4 py-2.5 text-sm font-semibold sm:self-center">Толығырақ →</Link></div></article>;
      })}
    </div>
  </section>;
}

function SectionFailure({ title, message, onRetry }: { title: string; message: string; onRetry: () => Promise<void> }) {
  const id = useId();
  return <section aria-labelledby={id} className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950"><h2 id={id} className="font-semibold">{title}</h2><p role="alert" className="mt-2 text-sm">{message}</p><button type="button" onClick={() => void onRetry()} className="mt-4 min-h-11 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2">Қайта жүктеу</button></section>;
}
