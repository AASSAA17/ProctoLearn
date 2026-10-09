'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';
import { CourseCoverArt, PremiumPublicFrame } from '@/components/PremiumPublicFrame';

type Lesson = { id: string; title: string };
type Course = { title: string; description?: string; level: string; teacher?: { name: string }; lessons: Lesson[]; modules: { id: string; title: string; lessons: Lesson[] }[]; exams: { id: string; title: string }[] };
const levelLabels: Record<string, string> = { BEGINNER: 'Бастаушы', INTERMEDIATE: 'Орта', ADVANCED: 'Жоғары' };

export default function PublicCoursePage() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/courses/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then((data: Course) => { setCourse(data); setError(false); })
      .catch(reason => { if (reason?.name !== 'AbortError') setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, reload]);

  return <PremiumPublicFrame>
    <div>
      <nav aria-label="Бет жолы" className="flex flex-wrap items-center gap-3 text-sm text-slate-400"><Link href="/" className="rounded-lg py-2 hover:text-white">Басты бет</Link><span aria-hidden="true">/</span><Link href="/courses" className="rounded-lg py-2 hover:text-white">Барлық курстар</Link><span aria-hidden="true">/</span><span aria-current="page" className="text-violet-300">Курс</span></nav>
      {loading ? <div role="status" className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-10 text-slate-300"><p>Курс жүктелуде...</p><div aria-hidden="true" className="mt-6 h-40 rounded-2xl bg-white/5 motion-safe:animate-pulse" /></div> : error || !course ? <div role="alert" className="mt-8 rounded-3xl border border-red-400/30 bg-red-950/30 p-8 text-red-200">
        Курсты жүктеу мүмкін болмады. <button type="button" className="min-h-11 rounded-lg px-2 font-semibold underline underline-offset-4" onClick={() => { setLoading(true); setReload(value => value + 1); }}>Қайта жүктеу</button>
      </div> : <>
        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[1fr_360px] lg:gap-16">
        <div className="min-w-0"><span className="inline-flex rounded-full border border-violet-400/25 bg-violet-500/10 px-4 py-1.5 text-xs font-semibold text-violet-200">{levelLabels[course.level] ?? course.level}</span>
        <h1 className="mt-6 break-words text-4xl font-semibold leading-tight sm:text-5xl">{course.title}</h1>
        <p className="mt-4 text-sm text-slate-400">Мұғалім: <span className="text-slate-200">{course.teacher?.name || 'Мұғалім көрсетілмеген'}</span></p>
        <p className="mt-7 whitespace-pre-line break-words text-base leading-relaxed text-slate-300">{course.description || 'Сипаттама әзірге жоқ.'}</p>
        <section className="mt-12 border-t border-white/10 pt-8" aria-labelledby="curriculum-title">
          <p className="mb-3 text-xs uppercase tracking-[.2em] text-violet-300">Қадам сайын алға</p><h2 id="curriculum-title" className="text-3xl font-semibold">Оқу жоспары</h2>
          {course.lessons.length + course.modules.reduce((sum, module) => sum + module.lessons.length, 0) === 0 ? <p className="mt-5 rounded-2xl border border-white/10 p-6 text-slate-400">Сабақтар әлі қосылмаған.</p> : <div className="mt-6 space-y-4">
            {course.lessons.length > 0 && <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.03]"><h3 className="border-b border-white/10 p-5 font-semibold">Сабақтар</h3><ol className="divide-y divide-white/10">{course.lessons.map((lesson, index) => <li className="flex gap-4 p-5 text-sm text-slate-300" key={lesson.id}><span aria-hidden="true" className="font-mono text-violet-300">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 break-words">{lesson.title}</span></li>)}</ol></div>}
            {course.modules.map((module, index) => <details key={module.id} open className="rounded-2xl border border-white/10 bg-white/[.03]"><summary className="cursor-pointer rounded-2xl p-5 font-semibold marker:text-violet-300">{index + 1}. {module.title}<span className="ml-3 text-xs font-normal text-slate-400">{module.lessons.length} сабақ</span></summary><ol className="divide-y divide-white/10 border-t border-white/10">{module.lessons.map((lesson, lessonIndex) => <li className="flex gap-4 p-5 text-sm text-slate-300" key={lesson.id}><span aria-hidden="true" className="font-mono text-violet-300">{String(lessonIndex + 1).padStart(2, '0')}</span><span className="min-w-0 break-words">{lesson.title}</span></li>)}</ol></details>)}
          </div>}
          {course.exams.length > 0 && <div className="mt-6 rounded-2xl border border-violet-400/20 bg-violet-500/5 p-6"><h3 className="font-semibold text-violet-200">Емтихандар</h3><ul className="mt-3 space-y-2 text-sm text-slate-300">{course.exams.map(exam => <li key={exam.id}>{exam.title}</li>)}</ul></div>}
        </section>
</div><aside className="overflow-hidden rounded-3xl border border-white/10 bg-[#111625] lg:sticky lg:top-28"><CourseCoverArt title={course.title} large /><div className="p-6"><h2 className="text-xl font-semibold">Оқуды бастауға дайынсыз ба?</h2><p className="mt-3 text-sm leading-relaxed text-slate-400">Тіркеліп, оқу кеңістігіне өтіңіз.</p><dl className="my-6 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-400">Сабақтар</dt><dd>{course.lessons.length + course.modules.reduce((sum, module) => sum + module.lessons.length, 0)}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-400">Модульдер</dt><dd>{course.modules.length}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-400">Емтихандар</dt><dd>{course.exams.length}</dd></div></dl><Link href="/auth/register" className="flex min-h-12 items-center justify-center rounded-xl bg-violet-600 px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-violet-700">Тіркеліп, курсты бастау <span aria-hidden="true" className="ml-2">↗</span></Link><Link href="/auth/login" className="mt-3 flex min-h-11 items-center justify-center rounded-xl text-sm text-slate-300 hover:bg-white/5">Тіркелгіңіз бар ма? Кіру</Link></div></aside></div>
      </>}
    </div>
  </PremiumPublicFrame>;
}
