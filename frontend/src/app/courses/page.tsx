'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';

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

  const chooseLevel = (value: Level) => { setLoading(true); setLevel(value); setPage(1); };
  const choosePage = (value: number) => { setLoading(true); setPage(value); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="text-xl font-extrabold text-primary-700">ProctoLearn</Link>
          <Link href="/auth/login" className="text-sm font-semibold text-primary-700 hover:underline">Кіру</Link>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-gray-900">Барлық курстар</h1>
        <p className="text-gray-600 mt-2 mb-7">Курстың сипаттамасын тіркелмей-ақ қараңыз.</p>
        <div className="flex flex-wrap gap-2 mb-8" aria-label="Деңгей бойынша сүзгі">
          {levels.map(item => <button key={item.value} type="button" onClick={() => chooseLevel(item.value)}
            aria-pressed={level === item.value}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${level === item.value ? 'bg-primary-700 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:border-primary-500'}`}>
            {item.label}
          </button>)}
        </div>
        {loading ? <p role="status" className="text-gray-600">Курстар жүктелуде...</p> : error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
            Курстарды жүктеу мүмкін болмады. <button type="button" className="font-semibold underline" onClick={() => { setLoading(true); setReload(value => value + 1); }}>Қайта жүктеу</button>
          </div>
        ) : !catalog?.data.length ? <p className="rounded-xl border bg-white p-6 text-gray-600">Бұл деңгейде әзірге курс жоқ.</p> : <>
          <p className="text-sm text-gray-600 mb-4">{catalog.total} курс</p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.data.map(course => <Link href={`/courses/${encodeURIComponent(course.id)}`} key={course.id}
              className="block rounded-xl border border-gray-200 bg-white p-5 hover:border-primary-500 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary-700">
              <span className="text-xs font-semibold text-primary-700">{levels.find(item => item.value === course.level)?.label ?? course.level}</span>
              <h2 className="text-lg font-bold text-gray-900 mt-2">{course.title}</h2>
              <p className="text-sm text-gray-600 mt-2 line-clamp-3">{course.description || 'Сипаттама әзірге жоқ.'}</p>
              <p className="text-xs text-gray-600 mt-4">{course.teacher?.name || 'Мұғалім көрсетілмеген'} · {course._count?.lessons ?? 0} сабақ · {course._count?.exams ?? 0} емтихан</p>
            </Link>)}
          </div>
          {catalog.totalPages > 1 && <nav aria-label="Каталог беттері" className="flex items-center justify-center gap-4 mt-8">
            <button type="button" disabled={page <= 1} onClick={() => choosePage(page - 1)} className="rounded-lg border bg-white px-4 py-2 text-primary-700 disabled:opacity-50">Алдыңғы бет</button>
            <span className="text-sm text-gray-700">{page} / {catalog.totalPages}</span>
            <button type="button" disabled={page >= catalog.totalPages} onClick={() => choosePage(page + 1)} className="rounded-lg border bg-white px-4 py-2 text-primary-700 disabled:opacity-50">Келесі бет</button>
          </nav>}
        </>}
      </div>
    </main>
  );
}
