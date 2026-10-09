'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon, Bars3Icon, XMarkIcon, CheckIcon, CodeBracketIcon } from '@heroicons/react/24/outline';
import { API_URL } from '@/lib/api';
import PremiumHeroScene from '@/components/landing/PremiumHeroScene';
import { TechnologyCategories, PremiumFeatures, LearningProcess, PremiumCTA } from '@/components/landing/PremiumSections';

interface Course {
  id: string;
  title: string;
  description: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  teacher?: { name: string };
  _count?: { lessons: number; enrollments: number };
}

const LEVELS = [
  { id: 'ALL', label: 'Барлығы' },
  { id: 'BEGINNER', label: 'Бастаушы' },
  { id: 'INTERMEDIATE', label: 'Орта деңгей' },
  { id: 'ADVANCED', label: 'Жоғары деңгей' },
];
const LEVEL_STYLES: Record<string, string> = {
  BEGINNER: 'text-emerald-200 bg-emerald-400/10 border-emerald-300/20',
  INTERMEDIATE: 'text-amber-200 bg-amber-400/10 border-amber-300/20',
  ADVANCED: 'text-rose-200 bg-rose-400/10 border-rose-300/20',
};

function MarketingNavigation() {
  const [menuOpen, setMenuOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const links = [['#courses', 'Курстар'], ['#features', 'Мүмкіндіктер'], ['#how', 'Оқу жолы']];

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); toggle.current?.focus(); }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#080b14]/90 backdrop-blur-xl">
      <nav aria-label="Негізгі навигация" className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="text-xl font-black tracking-tight text-white">Procto<span className="text-cyan-300">Learn</span></Link>
        <div className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
          {links.map(([href, label]) => <a key={href} href={href} className="py-3 hover:text-white">{label}</a>)}
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/auth/login" className="px-3 py-3 text-sm text-slate-300 hover:text-white">Кіру</Link>
          <Link href="/auth/register" className="premium-button bg-white text-slate-950 hover:bg-cyan-100">Бастау</Link>
        </div>
        <button ref={toggle} type="button" aria-expanded={menuOpen} aria-controls="marketing-menu" aria-label={menuOpen ? 'Мәзірді жабу' : 'Мәзірді ашу'} onClick={() => setMenuOpen((open) => !open)} className="rounded-xl border border-white/20 p-3 text-slate-200 md:hidden">
          {menuOpen ? <XMarkIcon aria-hidden="true" className="h-5 w-5" /> : <Bars3Icon aria-hidden="true" className="h-5 w-5" />}
        </button>
      </nav>
      {menuOpen && (
        <nav id="marketing-menu" aria-label="Мобильді навигация" className="flex flex-col gap-1 border-t border-white/10 px-4 py-4 text-sm text-slate-200 md:hidden">
          {links.map(([href, label]) => <a key={href} href={href} onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 hover:bg-white/5">{label}</a>)}
          <Link href="/auth/login" className="px-3 py-3">Кіру</Link>
          <Link href="/auth/register" className="premium-button mt-2 bg-white text-slate-950">Тіркелу</Link>
        </nav>
      )}
    </header>
  );
}

export default function HomePage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [coursesError, setCoursesError] = useState(false);
  const [reloadCourses, setReloadCourses] = useState(0);
  const [activeLevel, setActiveLevel] = useState('ALL');

  useEffect(() => {
    fetch(`${API_URL}/courses?limit=100`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => setCourses(Array.isArray(data) ? data : data?.data ?? []))
      .catch(() => { setCourses([]); setCoursesError(true); })
      .finally(() => setLoadingCourses(false));
  }, [reloadCourses]);

  const filtered = activeLevel === 'ALL' ? courses : courses.filter((course) => course.level === activeLevel);

  return (
    <div className="marketing-shell min-h-screen">
      <a href="#main-content" className="skip-link">Негізгі мазмұнға өту</a>
      <MarketingNavigation />
      <main id="main-content" tabIndex={-1}>
        <section className="marketing-grid overflow-hidden border-b border-white/10">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:py-24">
            <div className="min-w-0">
              <p className="eyebrow mb-5 text-cyan-300">Білімге жаңа көзқарас</p>
              <h1 className="max-w-3xl text-[clamp(2.5rem,5vw,4.5rem)] font-bold leading-[1.08] text-white">
                Болашағыңды <span className="bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-transparent">біліммен</span> қалыптастыр.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">Технологиялық дағдыларды жүйелі меңгер. Практикалық тапсырмалар орындап, емтихан арқылы өз прогресіңді көр.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/auth/register" className="premium-button gap-3 bg-violet-600 text-white shadow-lg shadow-violet-500/20 hover:bg-violet-700">Оқуды бастау <ArrowRightIcon aria-hidden="true" className="h-4 w-4" /></Link>
                <a href="#courses" className="premium-button border border-white/20 bg-white/5 text-white hover:bg-white/10">Курстарды көру</a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-xs text-slate-300">
                {['Қазақ тіліндегі интерфейс', 'Жеке оқу прогресі', 'QR тексеру'].map((benefit) => <li key={benefit} className="flex items-center gap-2"><CheckIcon aria-hidden="true" className="h-4 w-4 text-cyan-300" />{benefit}</li>)}
              </ul>
            </div>
            <PremiumHeroScene />
          </div>
        </section>
        <TechnologyCategories />
        <PremiumFeatures />

        <section id="courses" aria-labelledby="courses-heading" className="scroll-mt-20 border-y border-white/10 bg-[#0c111e] py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="eyebrow text-cyan-300">Кітапхана</p>
                <h2 id="courses-heading" className="mt-3 text-3xl font-bold text-white sm:text-4xl">Қолжетімді курстар</h2>
                <p className="mt-3 text-slate-300">Өзіңе сәйкес бағытты таңда.</p>
              </div>
              <Link href="/courses" className="py-3 text-sm font-semibold text-cyan-300 hover:text-cyan-200">Барлық курстар →</Link>
            </div>
            <div role="group" aria-label="Курс деңгейі" className="mt-8 flex flex-wrap gap-2">
              {LEVELS.map((level) => (
                <button key={level.id} type="button" aria-pressed={activeLevel === level.id} onClick={() => setActiveLevel(level.id)} className={`min-h-11 rounded-full border px-4 py-2 text-sm transition-colors ${activeLevel === level.id ? 'border-violet-300/40 bg-violet-400/20 text-white' : 'border-white/20 bg-white/5 text-slate-300 hover:text-white'}`}>
                  {level.label}
                </button>
              ))}
            </div>
            <div aria-live="polite" className="mt-5 text-sm text-slate-400">{loadingCourses ? 'Курстар жүктелуде…' : !coursesError ? `${filtered.length} курс табылды` : ''}</div>
            {loadingCourses ? (
              <div aria-hidden="true" className="mt-6 grid gap-4 md:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-72 animate-pulse rounded-3xl bg-white/5" />)}</div>
            ) : coursesError ? (
              <div role="alert" className="mt-6 rounded-2xl border border-rose-300/20 bg-rose-400/10 p-8 text-center text-rose-100">
                <p>Курстарды жүктеу мүмкін болмады.</p>
                <button type="button" className="mt-3 min-h-11 rounded-lg border border-rose-200/40 px-4 py-2 underline" onClick={() => { setLoadingCourses(true); setCoursesError(false); setReloadCourses((v) => v + 1); }}>Қайта жүктеу</button>
              </div>
            ) : filtered.length === 0 ? (
              <p className="mt-6 rounded-2xl border border-white/10 p-8 text-center text-slate-300">Бұл деңгейде әзірге курс жоқ.</p>
            ) : (
              <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {filtered.slice(0, 9).map((course) => (
                  <Link key={course.id} href={`/courses/${encodeURIComponent(course.id)}`} className="premium-card group overflow-hidden transition duration-200 hover:-translate-y-1 hover:border-violet-300/40">
                    <div aria-hidden="true" className="marketing-grid flex h-32 items-center justify-between border-b border-white/10 bg-gradient-to-br from-violet-500/15 to-cyan-400/5 px-7">
                      <CodeBracketIcon className="h-12 w-12 text-violet-300/80" /><span className="text-xs tracking-[0.2em] text-slate-300">PROCTOLEARN</span>
                    </div>
                    <div className="p-6">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${LEVEL_STYLES[course.level] ?? LEVEL_STYLES.BEGINNER}`}>{LEVELS.find((level) => level.id === course.level)?.label ?? course.level}</span>
                        {course._count?.lessons !== undefined && <span className="text-xs text-slate-400">{course._count.lessons} сабақ</span>}
                      </div>
                      <h3 className="mt-5 line-clamp-2 text-[1.375rem] font-semibold text-white group-hover:text-cyan-200">{course.title}</h3>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">{course.description}</p>
                      {course.teacher && <p className="mt-6 text-xs text-slate-400">Автор: {course.teacher.name}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
        <LearningProcess />
        <PremiumCTA />
      </main>
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 px-4 py-12 sm:flex-row sm:px-6">
          <div><p className="text-lg font-bold text-white">ProctoLearn</p><p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">Үйренуге, тәжірибе жинауға және нәтижені бағалауға арналған орта.</p></div>
          <nav aria-label="Қосымша навигация" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
            <Link href="/courses" className="py-3 hover:text-white">Курстар</Link><Link href="/auth/login" className="py-3 hover:text-white">Кіру</Link><Link href="/auth/register" className="py-3 hover:text-white">Тіркелу</Link>
          </nav>
        </div>
        <div className="mx-auto max-w-7xl border-t border-white/10 px-4 py-6 text-xs text-slate-400 sm:px-6">© {new Date().getFullYear()} ProctoLearn</div>
      </footer>
    </div>
  );
}
