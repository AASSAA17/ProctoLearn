'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';

type Lesson = { id: string; title: string };
type Course = { title: string; description?: string; level: string; teacher?: { name: string }; lessons: Lesson[]; modules: { id: string; title: string; lessons: Lesson[] }[]; exams: { id: string; title: string }[] };

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

  return <main className="min-h-screen bg-gray-50">
    <header className="bg-white border-b border-gray-200"><div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
      <Link href="/" className="text-xl font-extrabold text-primary-700">ProctoLearn</Link>
      <Link href="/auth/login" className="text-sm font-semibold text-primary-700 hover:underline">Кіру</Link>
    </div></header>
    <div className="max-w-4xl mx-auto px-4 py-10">
      <Link href="/courses" className="text-sm font-semibold text-primary-700 hover:underline">← Барлық курстар</Link>
      {loading ? <p role="status" className="mt-8 text-gray-600">Курс жүктелуде...</p> : error || !course ? <div role="alert" className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
        Курсты жүктеу мүмкін болмады. <button type="button" className="font-semibold underline" onClick={() => { setLoading(true); setReload(value => value + 1); }}>Қайта жүктеу</button>
      </div> : <>
        <h1 className="text-3xl font-bold text-gray-900 mt-8">{course.title}</h1>
        <p className="text-sm text-gray-600 mt-3">{course.teacher?.name || 'Мұғалім көрсетілмеген'} · {course.level}</p>
        <p className="text-gray-700 whitespace-pre-line mt-6">{course.description || 'Сипаттама әзірге жоқ.'}</p>
        <Link href="/auth/register" className="inline-block mt-8 rounded-lg bg-primary-700 px-6 py-3 font-semibold text-white hover:bg-primary-800">Тіркеліп, курсты бастау</Link>
        <section className="mt-12" aria-labelledby="curriculum-title">
          <h2 id="curriculum-title" className="text-xl font-bold text-gray-900">Оқу жоспары</h2>
          {course.lessons.length + course.modules.reduce((sum, module) => sum + module.lessons.length, 0) === 0 ? <p className="mt-3 text-gray-600">Сабақтар әлі қосылмаған.</p> : <div className="mt-4 space-y-4">
            {course.lessons.length > 0 && <div className="rounded-xl border bg-white p-5"><h3 className="font-semibold text-gray-900">Сабақтар</h3><ul className="list-disc pl-5 mt-2 text-gray-700">{course.lessons.map(lesson => <li key={lesson.id}>{lesson.title}</li>)}</ul></div>}
            {course.modules.map(module => <div key={module.id} className="rounded-xl border bg-white p-5"><h3 className="font-semibold text-gray-900">{module.title}</h3><ul className="list-disc pl-5 mt-2 text-gray-700">{module.lessons.map(lesson => <li key={lesson.id}>{lesson.title}</li>)}</ul></div>)}
          </div>}
          {course.exams.length > 0 && <p className="mt-5 text-sm text-gray-600">Емтихан: {course.exams.map(exam => exam.title).join(', ')}</p>}
        </section>
      </>}
    </div>
  </main>;
}
