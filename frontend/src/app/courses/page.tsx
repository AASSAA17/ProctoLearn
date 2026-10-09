'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';
import { CourseCoverArt, PremiumPublicFrame, PublicLoadingCards } from '@/components/PremiumPublicFrame';

type Level = 'ALL' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
type Course = { id: string; title: string; description?: string; level: string; teacher?: { name: string }; _count?: { lessons: number; exams: number } };
type Catalog = { data: Course[]; total: number; totalPages: number };
const levels: { value: Level; label: string }[] = [
  { value: 'ALL', label: 'Барлығы' }, { value: 'BEGINNER', label: 'Бастаушы' },
  { value: 'INTERMEDIATE', label: 'Орта' }, { value: 'ADVANCED', label: 'Жоғары' },
];

export default function PublicCoursesPage() {
  const [level, setLevel] = useState<Level>('ALL');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page), limit: '12' });
    if (level !== 'ALL') query.set('level', level);
    fetch(`${API_URL}/courses?${query}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then((data: Catalog) => {
        if (!Array.isArray(data?.data)) throw new Error('Invalid catalog');
        setCatalog(data); setError(false);
      })
      .catch((reason) => { if (reason?.name !== 'AbortError') setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [level, page, reload]);

  const chooseLevel = (value: Level) => {
    if (value === level && page === 1) return;
    setLoading(true); setLevel(value); setPage(1);
  };
  const choosePage = (value: number) => { setLoading(true); setPage(value); window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };

  return (
    <PremiumPublicFrame>
      <div>
        <p className="mb-5 text-xs font-semibold uppercase tracking-[.22em] text-violet-300">Білім кітапханасы</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">Жаңа дағды.<br /><span className="text-violet-300">Жаңа мүмкіндік.</span></h1>
        <p className="mb-10 mt-6 max-w-xl text-lg leading-relaxed text-slate-400">Өзіңізге сай бағытты табыңыз. Курстың сипаттамасы мен оқу жоспарын тіркелмей-ақ қараңыз.</p>
        <div className="mb-8 flex flex-wrap gap-2 border-b border-white/10 pb-6" role="group" aria-label="Деңгей бойынша сүзгі">
          {levels.map(item => <button key={item.value} type="button" onClick={() => chooseLevel(item.value)}
            aria-pressed={level === item.value}
            className={`min-h-11 rounded-full border px-5 py-2 text-sm font-semibold transition-colors ${level === item.value ? 'border-violet-400 bg-violet-600 text-white' : 'border-white/15 bg-white/[.03] text-slate-300 hover:border-violet-400 hover:text-white'}`}>
            {item.label}
          </button>)}
        </div>
        {loading ? <PublicLoadingCards /> : error ? (
          <div role="alert" className="rounded-3xl border border-red-400/30 bg-red-950/30 p-8 text-red-200">
            Курстарды жүктеу мүмкін болмады. <button type="button" className="min-h-11 rounded-lg px-2 font-semibold underline underline-offset-4" onClick={() => { setLoading(true); setReload(value => value + 1); }}>Қайта жүктеу</button>
          </div>
        ) : !catalog?.data.length ? <div className="rounded-3xl border border-white/10 bg-white/[.03] p-10 text-center"><h2 className="text-xl font-semibold">Бұл деңгейде әзірге курс жоқ</h2><p className="mt-3 text-slate-400">Басқа деңгейді таңдаңыз немесе барлық курстарды қараңыз.</p><button type="button" onClick={() => chooseLevel('ALL')} className="mt-6 min-h-11 rounded-xl border border-white/20 px-5 text-sm font-semibold hover:bg-white/10">Барлық курстар</button></div> : <>
          <p role="status" className="mb-5 text-sm text-slate-400">{catalog.total} курс қолжетімді</p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.data.map(course => <Link href={`/courses/${encodeURIComponent(course.id)}`} key={course.id}
              className="group flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#111625] transition-all duration-200 hover:-translate-y-1 hover:border-violet-400/50 hover:shadow-xl focus-visible:ring-violet-400 focus-visible:ring-offset-[#080b14]">
              <CourseCoverArt title={course.title} />
              <div className="flex flex-1 flex-col p-6"><span className="w-fit rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-200">{levels.find(item => item.value === course.level)?.label ?? course.level}</span>
              <h2 className="mt-4 break-words text-xl font-semibold text-white">{course.title}</h2>
              <p className="mb-6 mt-3 line-clamp-3 text-sm leading-relaxed text-slate-400">{course.description || 'Сипаттама әзірге жоқ.'}</p>
              <div className="mt-auto border-t border-white/10 pt-4"><p className="text-sm text-slate-300">{course.teacher?.name || 'Мұғалім көрсетілмеген'}</p><div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-400"><span>{course._count?.lessons ?? 0} сабақ · {course._count?.exams ?? 0} емтихан</span><span aria-hidden="true" className="text-xl text-violet-300">↗</span></div></div></div>
            </Link>)}
          </div>
          {catalog.totalPages > 1 && <nav aria-label="Каталог беттері" className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <button type="button" disabled={page <= 1} onClick={() => choosePage(page - 1)} className="min-h-11 rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">Алдыңғы бет</button>
            <span className="text-sm text-slate-400">{page} / {catalog.totalPages}</span>
            <button type="button" disabled={page >= catalog.totalPages} onClick={() => choosePage(page + 1)} className="min-h-11 rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">Келесі бет</button>
          </nav>}
        </>}
      </div>
    </PremiumPublicFrame>
  );
}
