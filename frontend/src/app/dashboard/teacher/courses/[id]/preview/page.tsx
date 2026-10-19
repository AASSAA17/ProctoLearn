'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import LoadFailure from '@/components/LoadFailure';
import StepContent, { type LearningStep } from '@/components/learning/StepContent';

interface PreviewLesson {
  id: string;
  title: string;
  order: number;
  steps: LearningStep[];
}

interface PreviewModule {
  id: string;
  title: string;
  order: number;
  lessons: PreviewLesson[];
}

interface PreviewCourse {
  id: string;
  title: string;
  description?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  modules: PreviewModule[];
  preview: { readOnly: true; academicWrites: false };
}

const STATUS_LABELS = {
  DRAFT: 'Жоба',
  ARCHIVED: 'Мұрағатта',
} as const;

export default function TeacherCoursePreviewPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const [course, setCourse] = useState<PreviewCourse | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data } = await api.get(`/courses/${courseId}/preview`);
      setCourse(data);
      const firstLesson = data.modules?.flatMap((module: PreviewModule) => module.lessons ?? [])[0];
      setActiveLessonId((current) => current ?? firstLesson?.id ?? null);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    const request = window.setTimeout(() => { void loadPreview(); }, 0);
    return () => window.clearTimeout(request);
  }, [loadPreview]);

  const lessons = useMemo(
    () => course?.modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleTitle: module.title }))) ?? [],
    [course],
  );
  const activeLesson = lessons.find((lesson) => lesson.id === activeLessonId) ?? lessons[0];

  if (loading) return <div className="flex justify-center py-16"><div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary-600" /></div>;
  if (loadError) return <LoadFailure onRetry={() => void loadPreview()} />;
  if (!course) return null;
  const preliminary = course.description?.trimStart().startsWith('Алдын ала оқу материалы.') ?? false;
  const statusLabel = course.status === 'PUBLISHED'
    ? preliminary ? 'Алдын ала материал ретінде жарияланған' : 'Жарияланған'
    : STATUS_LABELS[course.status];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href={`/dashboard/teacher/courses/${course.id}/edit`} className="font-medium text-primary-700 hover:underline">
          ← Курс редакторына оралу
        </Link>
        <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-900">{statusLabel}</span>
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5" aria-labelledby="preview-heading">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">Оқушы көрінісі · тек алдын ала қарау</p>
        <h1 id="preview-heading" className="mt-2 text-2xl font-bold text-gray-950">{course.title}</h1>
        {course.description && <p className="mt-2 max-w-3xl text-sm text-gray-700">{course.description}</p>}
        <p className="mt-3 text-sm text-amber-900">
          Бұл бет оқушы интерфейсін көрсетеді. Мұнда тіркелу, прогресс, жауап, емтихан, жазба немесе сертификат сақталмайды.
        </p>
      </section>

      {lessons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-600">
          Алдын ала қарайтын сабақтар әлі жоқ.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-4 lg:sticky lg:top-5" aria-label="Курс мазмұны">
            <label htmlFor="preview-lesson" className="mb-2 block text-sm font-semibold text-gray-900 lg:hidden">Сабақты таңдаңыз</label>
            <select
              id="preview-lesson"
              value={activeLesson?.id ?? ''}
              onChange={(event) => setActiveLessonId(event.target.value)}
              className="input lg:hidden"
            >
              {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.moduleTitle}: {lesson.title}</option>)}
            </select>
            <div className="hidden space-y-4 lg:block">
              {course.modules.map((module) => (
                <section key={module.id} aria-labelledby={`preview-module-${module.id}`}>
                  <h2 id={`preview-module-${module.id}`} className="text-sm font-bold text-gray-900">{module.order}. {module.title}</h2>
                  <div className="mt-2 space-y-1">
                    {module.lessons.map((lesson) => (
                      <button
                        key={lesson.id}
                        type="button"
                        aria-current={activeLesson?.id === lesson.id ? 'page' : undefined}
                        onClick={() => setActiveLessonId(lesson.id)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${activeLesson?.id === lesson.id ? 'bg-primary-100 font-semibold text-primary-900' : 'text-gray-700 hover:bg-gray-100'}`}
                      >
                        {lesson.order}. {lesson.title}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </aside>

          <main className="min-w-0 space-y-5">
            {activeLesson && (
              <>
                <header className="rounded-2xl border border-gray-200 bg-white p-5">
                  <p className="text-sm font-medium text-primary-700">{activeLesson.moduleTitle}</p>
                  <h2 className="mt-1 text-xl font-bold text-gray-950">{activeLesson.title}</h2>
                  <p className="mt-2 text-sm text-gray-600">{activeLesson.steps.length} оқу қадамы</p>
                </header>
                {activeLesson.steps.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">Бұл сабақта оқу қадамдары жоқ.</div>
                )}
                {activeLesson.steps.map((step) => (
                  <section key={step.id} className="space-y-2" aria-label={`${step.order}-қадам`}>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{step.order}-қадам</p>
                    <StepContent step={step} preview />
                  </section>
                ))}
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
